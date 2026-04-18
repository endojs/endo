;;; Minimal tcp-testing-only interop client for the Endo goblin-chat host.
;;;
;;; Intended to run inside `guix shell --manifest=manifest.scm`.
;;;
;;; Expected env/args:
;;;   $1  sturdyref URI printed by `test/goblin-chat/index.js`
;;;   $2  message to send
;;;
;;; Exit 0 on a successful `send-message` ack, non-zero otherwise.
;;;
;;; Guix's packaged guile-goblins may not include a dedicated
;;; `(goblins ocapn netlayer tcp-testing)` module. To keep this script runnable
;;; against those builds, we define a small tcp-testing netlayer actor locally,
;;; following Goblins' own OCapN test-suite implementation. We also define a
;;; minimal user-controller pair locally so this client doesn't depend on
;;; `(goblin-chat backend)`, whose extra module dependencies vary by package
;;; build.

(use-modules (goblins)
             (goblins actor-lib common)
             (goblins actor-lib io)
             (goblins actor-lib methods)
             (goblins actor-lib sealers)
             (goblins ocapn captp)
             (goblins ocapn ids)
             (goblins ocapn netlayer base-port)
             (goblins utils hashmap)
             (ice-9 iconv)
             (ice-9 match)
             (fibers conditions))

;; Copied from Goblins' OCapN test-suite pattern:
;; this gives us a tcp-testing-only netlayer without depending on a module that
;; might be absent from packaged guile-goblins.
(define (use-nonblocking-i/o port)
  (fcntl port F_SETFL (logior O_NONBLOCK (fcntl port F_GETFL))))

(define (make-server-socket+port port max-connections)
  (let ((sock (socket AF_INET SOCK_STREAM IPPROTO_TCP)))
    (bind sock AF_INET INADDR_ANY (or port 0))
    (setsockopt sock SOL_SOCKET SO_REUSEADDR 1)
    (fcntl sock F_SETFD FD_CLOEXEC)
    (use-nonblocking-i/o sock)
    (listen sock max-connections)
    (values sock (vector-ref (getsockname sock) 2))))

(define (make-client-socket host port)
  ;; Resolve hostname to get IP address.
  (match (getaddrinfo host (number->string port)
                      AI_NUMERICSERV AF_INET SOCK_STREAM IPPROTO_TCP)
    ((info _ ...)
     (let* ((family (addrinfo:fam info))
            (socktype (addrinfo:socktype info))
            (address (sockaddr:addr (addrinfo:addr info)))
            (sock (socket family socktype IPPROTO_TCP)))
       (use-nonblocking-i/o sock)
       (connect sock family address port)
       sock))))

(define-actor (^tcp-testing-netlayer bcom host #:optional [port 0])
  (define-values (sock assigned-port)
    (make-server-socket+port port 32))
  (define socket-io
    (spawn ^io sock #:cleanup close-port))

  (define our-location
    (make-ocapn-peer 'tcp-testing-only
                     "guile-goblins"
                     (hashmap ("host" host)
                              ("port" (number->string assigned-port)))))

  (define (incoming-accept)
    (on (<- socket-io
            (lambda (resource)
              (accept resource O_NONBLOCK)))
        (match-lambda
          ((client-socket . _)
           (setvbuf client-socket 'block)
           (use-nonblocking-i/o client-socket)
           client-socket))
        #:promise? #t))

  (define (outgoing-connect-to-loc loc)
    (unless (eq? (ocapn-peer-transport loc) 'tcp-testing-only)
      (error "Wrong netlayer! Expected `tcp-testing-only'" loc))
    (let* ((hints (ocapn-peer-hints loc))
           (host (hashmap-ref hints "host"))
           (port (hashmap-ref hints "port")))
      (make-client-socket host (string->number port))))

  (define main-beh
    (^base-port-netlayer bcom our-location incoming-accept
                         outgoing-connect-to-loc))

  (extend-methods main-beh
   ((halt)
    ($ socket-io 'halt))))

;; Minimal subset of goblin-chat backend needed for CI:
;; - create a user with the expected methods
;; - join a room via `subscribe`
;; - return an authenticated channel that seals chat messages
(define (spawn-user-controller-pair self-proposed-name)
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
                (lambda (_message)
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
    (make-ocapn-sturdyref ocapn-id
                          (string->bytevector
                           (ocapn-peer-designator ocapn-id)
                           "ascii")))
   (else
    (error "Expected OCapN sturdyref/peer URI" uri-string))))

(define machine-vat (spawn-vat))
(define user-vat (spawn-vat))

(define (machine-run thunk) (with-vat machine-vat (thunk)))
(define (user-run thunk) (with-vat user-vat (thunk)))

(define netlayer
  (machine-run (lambda () (spawn ^tcp-testing-netlayer "127.0.0.1"))))

(define mycapn
  (machine-run (lambda () (spawn-mycapn netlayer))))

(define chat-sref (uri->chat-sturdyref uri))

(define-values (user user-controller)
  (user-run (lambda () (spawn-user-controller-pair "endo-interop-ci"))))

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
                  (signal-condition! done?))
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
