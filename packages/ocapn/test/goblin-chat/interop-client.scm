;;; Minimal websocket interop client for the Endo goblin-chat host.
;;;
;;; This intentionally keeps Guile-side logic small and relies on Spritely's
;;; existing `(goblin-chat backend)` for all chat protocol behavior.

(use-modules (goblins)
             (goblin-chat backend)
             (goblins actor-lib methods)
             (goblins ocapn captp)
             (goblins ocapn ids)
             (goblins ocapn netlayer websocket)
             (goblins utils hashmap)
             (ice-9 iconv)
             (fibers conditions))

(define done? (make-condition))
(define args (cdr (command-line)))

(define uri (list-ref args 0))
(define local-message (list-ref args 1))
(define expected-remote-message
  (if (> (length args) 2)
      (list-ref args 2)
      "hello from Endo OCapN"))

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

;; The host may print either a sturdyref URI or a peer URI with the swiss
;; number in hints / designator.
(define (uri->chat-sturdyref uri-string)
  (define ocapn-id (string->ocapn-id uri-string))
  (cond
   ((ocapn-sturdyref? ocapn-id)
    ocapn-id)
   ((ocapn-peer? ocapn-id)
    (define hints (ocapn-peer-hints ocapn-id))
    (define swiss (and hints (hashmap-ref hints "swiss" #f)))
    (make-ocapn-sturdyref ocapn-id
                          (string->bytevector
                           (or swiss (ocapn-peer-designator ocapn-id))
                           "ascii")))
   (else
    (error "Expected OCapN sturdyref/peer URI" uri-string))))

(define (^interop-observer _bcom)
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
   ((user-joined _user) #t)
   ((user-left _user) #t)))

(define machine-vat (spawn-vat))
(define user-vat (spawn-vat))
(define (machine-run thunk) (with-vat machine-vat (thunk)))
(define (user-run thunk) (with-vat user-vat (thunk)))

(define netlayer
  (machine-run (lambda () (spawn ^websocket-netlayer #:encrypted? #f))))
(define mycapn
  (machine-run (lambda () (spawn-mycapn netlayer))))
(define chat-sref (uri->chat-sturdyref uri))

(define-values (_user user-controller)
  (user-run (lambda () (spawn-user-controller-pair "endo-interop-ci"))))

(user-run
 (lambda ()
   (on (<- mycapn 'enliven chat-sref)
       (lambda (chatroom)
         (on (<- user-controller 'join-room chatroom)
             (lambda (channel)
               (on (<- channel 'subscribe (spawn ^interop-observer))
                   (lambda (_subscription-result)
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
                   #:catch
                   (lambda (err)
                     (fatal! "subscribe failed" err))
                   #:promise? #t))
             #:catch
             (lambda (err)
               (fatal! "join-room failed" err))
             #:promise? #t))
       #:catch
       (lambda (err)
         (fatal! "enliven failed" err))
       #:promise? #t)))

(wait done?)
(primitive-exit 0)
