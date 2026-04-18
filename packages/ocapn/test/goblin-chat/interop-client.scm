;;; Minimal tcp-testing-only interop client for the Endo goblin-chat host.
;;;
;;; Intended to run inside `guix shell --manifest=manifest.scm` against
;;; spritely/goblin-chat checked out at $GOBLIN_CHAT_SRC, so it can reuse
;;; that repository's (goblin-chat backend) for the user-controller side.
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
;;; following Goblins' own OCapN test-suite implementation.

(use-modules (goblins)
             (goblins actor-lib common)
             (goblins actor-lib io)
             (goblins ocapn captp)
             (goblins ocapn ids)
             (goblins ocapn netlayer base-port)
             (goblins utils hashmap)
             (goblin-chat backend)
             (ice-9 match))

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
    (on-match (<- socket-io
                  (lambda (resource)
                    (accept resource O_NONBLOCK)))
        ((client-socket . _)
         (setvbuf client-socket 'block)
         (use-nonblocking-i/o client-socket)
         client-socket)))

  (define (outgoing-connect-to-loc loc)
    (unless (eq? (ocapn-peer-transport loc) 'tcp-testing-only)
      (error "Wrong netlayer! Expected `tcp-testing-only'" loc))
    (let*-values (((hints) (ocapn-peer-hints loc))
                  ((host) (hashmap-ref hints "host"))
                  ((port) (hashmap-ref hints "port")))
      (make-client-socket host (string->number port))))

  (define main-beh
    (^base-port-netlayer bcom our-location incoming-accept
                         outgoing-connect-to-loc))

  (extend-methods main-beh
   ((halt)
    ($ socket-io 'halt))))

(define args (cdr (command-line)))
(define uri (list-ref args 0))
(define message (list-ref args 1))

(define machine-vat (spawn-vat))
(define user-vat (spawn-vat))

(define (machine-run thunk) (with-vat machine-vat (thunk)))
(define (user-run thunk) (with-vat user-vat (thunk)))

(define netlayer
  (machine-run (lambda () (spawn ^tcp-testing-netlayer "127.0.0.1"))))

(define mycapn
  (machine-run (lambda () (spawn-mycapn netlayer))))

(define chat-sref (string->ocapn-id uri))

(define-values (user user-controller)
  (user-run (lambda () (spawn-user-controller-pair "endo-interop-ci"))))

(define chatroom-vow
  (user-run (lambda () (<- mycapn 'enliven chat-sref))))

(on chatroom-vow
    (lambda (chatroom)
      (define channel-vow
        (user-run (lambda () (<- user-controller 'join-room chatroom))))
      (on channel-vow
          (lambda (channel)
            (define ack-vow
              (user-run (lambda () (<- channel 'send-message message))))
            (on ack-vow
                (lambda (ack)
                  (display "interop-client: sent message, ack = ")
                  (write ack)
                  (newline)
                  (exit 0))
                #:catch
                (lambda (err)
                  (display "interop-client: send failed: ")
                  (write err)
                  (newline)
                  (exit 2))
                #:promise? #t))
          #:catch
          (lambda (err)
            (display "interop-client: join-room failed: ")
            (write err)
            (newline)
            (exit 3))
          #:promise? #t))
    #:catch
    (lambda (err)
      (display "interop-client: enliven failed: ")
      (write err)
      (newline)
      (exit 4))
    #:promise? #t)

(wait forever)
