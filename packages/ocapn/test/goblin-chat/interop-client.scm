;;; Minimal websocket interop host for Endo OCapN.
;;;
;;; This intentionally keeps Guile-side logic small and uses Spritely's
;;; existing `(goblin-chat backend)` to host the chatroom.

(use-modules (goblins)
             (goblin-chat backend)
             (goblins actor-lib methods)
             (goblins ocapn captp)
             (goblins ocapn ids)
             (goblins ocapn netlayer websocket)
             (fibers conditions))

(define done? (make-condition))
(define args (cdr (command-line)))

(define (arg-or-default idx default)
  (if (> (length args) idx)
      (list-ref args idx)
      default))

(define local-message
  (arg-or-default 0 "hello from Guile CI"))
(define expected-remote-message
  (arg-or-default 1 "hello from Endo OCapN"))
(define websocket-port
  (let ((env-port (getenv "OCAPN_TEST_PORT")))
    (if env-port
        (string->number env-port)
        22047)))

(define sent-local-message? #f)
(define sent-ack? #f)
(define saw-local-message? #f)
(define saw-remote-message? #f)
(define finished? #f)

(define (finish-if-ready!)
  (when (and (not finished?)
             sent-ack?
             saw-local-message?
             saw-remote-message?)
    (set! finished? #t)
    (display "interop-client: observed local+remote messages and ack")
    (newline)
    (signal-condition! done?)))

(define (fatal! label err)
  (display "interop-client: ")
  (display label)
  (display ": ")
  (write err)
  (newline)
  (signal-condition! done?)
  (primitive-exit 1))

(define (^interop-observer _bcom user channel)
  (methods
   ((new-message _context _from-user observed-message)
    (define message-string
      (if (string? observed-message)
          observed-message
          (format #f "~a" observed-message)))
    (when (string=? message-string local-message)
      (set! saw-local-message? #t))
    (when (string=? message-string expected-remote-message)
      (set! saw-remote-message? #t))
    (finish-if-ready!)
    #t)
   ((user-joined joining-user)
    (when (and (not sent-local-message?)
               (not (eq? joining-user user)))
      (set! sent-local-message? #t)
      (on (<- channel 'send-message local-message)
          (lambda (ack)
            (display "interop-client: sent message, ack = ")
            (write ack)
            (newline)
            (set! sent-ack? #t)
            (finish-if-ready!))
          #:catch
          (lambda (err)
            (fatal! "send-message failed" err))
          #:promise? #t))
    #t)
   ((user-left _user) #t)))

(define machine-vat (spawn-vat))
(define user-vat (spawn-vat))
(define (machine-run thunk) (with-vat machine-vat (thunk)))
(define (user-run thunk) (with-vat user-vat (thunk)))

(define netlayer
  (machine-run
   (lambda ()
     (spawn ^websocket-netlayer
            #:encrypted? #f
            #:port websocket-port))))
(define mycapn
  (machine-run (lambda () (spawn-mycapn netlayer))))
(define chatroom
  (user-run (lambda () (spawn ^chatroom "#interop-room"))))
(define-values (user user-controller)
  (user-run (lambda () (spawn-user-controller-pair "guile-interop-host"))))

;; Register the chatroom on the websocket transport and print sturdyref for Endo.
(machine-run
 (lambda ()
   (on (<- mycapn 'register chatroom 'websocket)
       (lambda (chat-sref)
         (display "sturdyref: ")
         (display (ocapn-id->string chat-sref))
         (newline))
       #:catch
       (lambda (err)
         (fatal! "register failed" err))
       #:promise? #t)))

;; Join locally and wait for Endo to join. Once Endo joins, send the local
;; message and verify bilateral message flow.
(user-run
 (lambda ()
   (on (<- user-controller 'join-room chatroom)
       (lambda (channel)
         (on (<- channel 'subscribe (spawn ^interop-observer user channel))
             (lambda (_subscription-result)
               (display "interop-client: subscription ready")
               (newline))
             #:catch
             (lambda (err)
               (fatal! "subscribe failed" err))
             #:promise? #t))
       #:catch
       (lambda (err)
         (fatal! "join-room failed" err))
       #:promise? #t)))

(wait done?)
(primitive-exit 0)
