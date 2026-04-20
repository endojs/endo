;;; Minimal websocket interop client for the Endo goblin-chat host.
;;;
;;; Intended to run inside `guix shell --manifest=manifest.scm`.
;;;
;;; Expected env/args:
;;;   $1  sturdyref URI printed by `test/goblin-chat/index.js`
;;;   $2  message Guile sends to the room
;;;   $3  message expected from Endo OCapN observer client
;;;
;;; Exit 0 after:
;;;   - successful `send-message` ack, and
;;;   - observing both the Guile message and Endo message in inbox callbacks.
;;;
;;; We intentionally use Spritely's existing websocket netlayer implementation
;;; to exercise the same framing and designator-auth path used by Goblins.
;;; We still define a minimal user-controller pair locally so this client
;;; doesn't depend on `(goblin-chat backend)`, whose extra module dependencies
;;; vary by package build.

(use-modules (goblins)
             (goblins actor-lib common)
             (goblins actor-lib methods)
             (goblins actor-lib sealers)
             (goblins ocapn captp)
             (goblins ocapn ids)
             (goblins ocapn netlayer websocket)
             (goblins utils hashmap)
             (ice-9 iconv)
             (ice-9 match)
             (fibers conditions))

;; Minimal subset of goblin-chat backend needed for CI:
;; - create a user with the expected methods
;; - join a room via `subscribe`
;; - return an authenticated channel that seals chat messages
(define (spawn-user-controller-pair self-proposed-name note-observed-message!)
  (define-values (chat-msg-sealer chat-msg-unsealer chat-msg-sealed?)
    (spawn-sealer-triplet))
  (define-values (subscription-sealer subscription-unsealer _subscription-sealed?)
    (spawn-sealer-triplet))

  (define (^user _bcom)
    (methods
     ((self-proposed-name) self-proposed-name)
     ((get-chat-sealed?) chat-msg-sealed?)
     ((get-chat-unsealer) chat-msg-unsealer)
     ((get-subscription-sealer) subscription-sealer)))
  (define user (spawn ^user))

  (define (^user-inbox _bcom context)
    (methods
     ((new-message from-user sealed-msg)
      ;; Decode messages to exercise the same app-layer path as Goblins.
      (on (<- from-user 'get-chat-unsealer)
          (lambda (chat-unsealer)
            (on (<- chat-unsealer sealed-msg)
                (lambda (decoded-message)
                  (note-observed-message! decoded-message)
                  #t)
                #:promise? #t))
          #:promise? #t)
      #t)
     ((user-joined _user) #t)
     ((user-left _user) #t)
     ((context) context)))

  (define (^authenticated-channel _bcom room-channel)
    (methods
     ((send-message contents)
      (on (<- chat-msg-sealer contents)
          (lambda (sealed-msg)
            (<- room-channel 'send-message sealed-msg))
          #:promise? #t))
     ((leave)
      (<- room-channel 'leave))
     ((list-users)
      (<- room-channel 'list-users))))

  (define (^user-controller _bcom)
    (methods
     ((whoami) user)
     ((join-room room)
      (define inbox (spawn ^user-inbox room))
      (define sealed-finalizer-vow
        (<- room 'subscribe user))
      (define subscription-finalizer-vow
        (<- subscription-unsealer sealed-finalizer-vow))
      (on (<- subscription-finalizer-vow inbox)
          (lambda (room-channel)
            (spawn ^authenticated-channel room-channel))
          #:promise? #t))))

  (define user-controller
    (spawn ^user-controller))
  (values user user-controller))

(define done?
  (make-condition))

(define args (cdr (command-line)))
(define uri (list-ref args 0))
(define message (list-ref args 1))
(define expected-remote-message
  (if (> (length args) 2)
      (list-ref args 2)
      "hello from Endo OCapN"))

(define sent-ack? #f)
(define saw-local-message? #f)
(define saw-remote-message? #f)
(define completed? #f)

(define (maybe-finish!)
  (when (and (not completed?)
             sent-ack?
             saw-local-message?
             saw-remote-message?)
    (set! completed? #t)
    (display "interop-client: observed local+remote messages and ack")
    (newline)
    (signal-condition! done?)))

(define (record-observed-message! observed-message)
  (unless (string? observed-message)
    (display "interop-client: ignoring non-string message")
    (newline)
    (set! observed-message (format #f "~a" observed-message)))
  (display "interop-client: observed message = ")
  (write observed-message)
  (newline)
  (when (string=? observed-message message)
    (set! saw-local-message? #t))
  (when (string=? observed-message expected-remote-message)
    (set! saw-remote-message? #t))
  (maybe-finish!))

;; Endo's interop host currently prints a peer-style URI where the designator is
;; the swiss number. Goblins `enliven` expects an actual sturdyref object.
;; Accept both forms:
;;   - ocapn://<peer>.<transport>/s/<base64swiss>?...
;;   - ocapn://<swiss-as-designator>.<transport>?...
(define (uri->chat-sturdyref uri-string)
  (define ocapn-id
    (string->ocapn-id uri-string))
  (cond
   ((ocapn-sturdyref? ocapn-id)
    ocapn-id)
   ((ocapn-peer? ocapn-id)
    (define hints
      (ocapn-peer-hints ocapn-id))
    (define swiss
      (and hints (hashmap-ref hints "swiss" #f)))
    (make-ocapn-sturdyref ocapn-id
                          (string->bytevector
                           (or swiss
                               (ocapn-peer-designator ocapn-id))
                           "ascii")))
   (else
    (error "Expected OCapN sturdyref/peer URI" uri-string))))

(define machine-vat (spawn-vat))
(define user-vat (spawn-vat))

(define (machine-run thunk) (with-vat machine-vat (thunk)))
(define (user-run thunk) (with-vat user-vat (thunk)))

(define netlayer
  (machine-run (lambda () (spawn ^websocket-netlayer #:encrypted? #f))))

(define mycapn
  (machine-run (lambda () (spawn-mycapn netlayer))))

(define chat-sref (uri->chat-sturdyref uri))

(define-values (user user-controller)
  (user-run
   (lambda ()
     (spawn-user-controller-pair "endo-interop-ci" record-observed-message!))))

(define chatroom-vow
  (user-run (lambda () (<- mycapn 'enliven chat-sref))))

(user-run
 (lambda ()
   (on chatroom-vow
       (lambda (chatroom)
         (define channel-vow
           (<- user-controller 'join-room chatroom))
         (on channel-vow
             (lambda (channel)
               (define ack-vow
                 (<- channel 'send-message message))
               (on ack-vow
                   (lambda (ack)
                     (display "interop-client: sent message, ack = ")
                     (write ack)
                     (newline)
                     (unless (equal? ack "OK")
                       (display "interop-client: unexpected ack value")
                       (newline)
                       (signal-condition! done?)
                       (primitive-exit 5))
                     (set! sent-ack? #t)
                     (maybe-finish!))
                   #:catch
                   (lambda (err)
                     (display "interop-client: send failed: ")
                     (write err)
                     (newline)
                  (signal-condition! done?)
                  (primitive-exit 2))
                   #:promise? #t))
             #:catch
             (lambda (err)
               (display "interop-client: join-room failed: ")
               (write err)
               (newline)
              (signal-condition! done?)
              (primitive-exit 3))
             #:promise? #t))
       #:catch
       (lambda (err)
         (display "interop-client: enliven failed: ")
         (write err)
         (newline)
         (signal-condition! done?)
         (primitive-exit 4))
       #:promise? #t)))
(wait done?)
(primitive-exit 0)
