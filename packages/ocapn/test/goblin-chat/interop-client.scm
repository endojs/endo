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
;;;   - successful `send-message` call, and
;;;   - observing both the Guile message and Endo message in inbox callbacks.
;;;
;;; We intentionally use Spritely's existing websocket netlayer implementation
;;; to exercise the same framing and designator-auth path used by Goblins.
;;; For chat behavior, we import Spritely's published `(goblin-chat backend)`
;;; directly and add only compatibility shims in this repo when Guix variants
;;; are missing helper modules.

(use-modules (goblins)
             (goblin-chat backend)
             (goblins actor-lib methods)
             (goblins ocapn captp)
             (goblins ocapn ids)
             (goblins ocapn netlayer websocket)
             (goblins utils hashmap)
             (ice-9 iconv)
             (ice-9 match)
             (fibers conditions))

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
(define inbox-subscription-setup? #f)

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

(define (^interop-observer _bcom)
  (methods
   ((new-message _context _from-user observed-message)
    (record-observed-message! observed-message)
    #t)
   ((user-joined _user) #t)
   ((user-left _user) #t)))

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
     (spawn-user-controller-pair "endo-interop-ci"))))

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
              (define subscriber
                (spawn ^interop-observer))
              (define inbox-subscription-vow
                (<- channel 'subscribe subscriber))
              (on inbox-subscription-vow
                  (lambda (subscription-result)
                    (match subscription-result
                      (#(OK _unsubscribe-cap)
                       (set! inbox-subscription-setup? #t))
                      (_
                       (display "interop-client: channel subscribe returned unexpected value")
                       (newline)
                       (write subscription-result)
                       (newline)
                       (signal-condition! done?)
                       (primitive-exit 6))))
                  #:catch
                  (lambda (err)
                    (display "interop-client: channel subscribe failed: ")
                    (write err)
                    (newline)
                    (signal-condition! done?)
                    (primitive-exit 7))
                  #:promise? #t)
               (define ack-vow
                 (<- channel 'send-message message))
               (on ack-vow
                   (lambda (ack)
                     (display "interop-client: sent message, ack = ")
                     (write ack)
                     (newline)
                     (set! sent-ack? #t)
                     (unless inbox-subscription-setup?
                       (display "interop-client: channel subscribe not confirmed before ack")
                       (newline)
                       (signal-condition! done?)
                       (primitive-exit 5))
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
