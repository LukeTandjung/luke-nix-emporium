(in-package #:autolith)

(-> test-user-ask-tool () null)
(defun test-user-ask-tool ()
  "Test user.ask registration, policy, validation, structured output, and safe failure."
  (let* ((registry (make-default-tool-registry))
         (tool (tool-registry-find registry "user" "ask"))
         (configuration (test-configuration))
         (root (test-configuration-root configuration))
         (conversation
           (conversation-create configuration :identifier "user-ask-tool"))
         (arguments
           (json-object
            "questions"
            (vector
             (json-object "question" "Choose a color"
                          "options" (vector "red" "blue"))
             (json-object "question" "Choose a size"
                          "options" (vector "small" "large")))))
           (ask-count 0)
         (observer
           (callback-agent-observer-create
            :ask-user-callback
            (lambda (questions)
                (incf ask-count)
              (test-assert (= (length questions) 2)
                           "user.ask passes normalized questions to observer")
              '("blue" "large"))))
         (context
           (make-instance 'tool-context
                          :configuration configuration
                          :worker nil
                          :conversation conversation
                          :registry registry
                          :observer observer)))
    (unwind-protect
         (progn
           (test-assert (typep tool 'user-ask-tool)
                        "default registry includes user.ask")
           (test-assert (tool-provider-round-trip-barrier-p tool)
                        "user.ask is a provider round-trip barrier")
           (test-assert (eq (tool-execution-policy tool) ':exclusive)
                        "user.ask executes exclusively")
           (test-assert (not (tool-child-safe-p tool))
                        "user.ask is not child-safe")
            (let* ((schema (tool-provider-schema tool))
                   (parameters (gethash "parameters" schema))
                   (questions
                     (gethash "questions" (gethash "properties" parameters)))
                   (item (gethash "items" questions))
                   (properties (gethash "properties" item))
                   (question (gethash "question" properties))
                   (options (gethash "options" properties))
                   (option (gethash "items" options)))
               (test-assert
                (and (= (gethash "minLength" question) 1)
                     (= (gethash "maxLength" question)
                        +user-ask-question-character-limit+)
                     (= (gethash "minLength" option) 1)
                     (= (gethash "maxLength" option)
                        +user-ask-option-character-limit+))
                "user.ask schema bounds question and option text")
               (let* ((prompt
                        (make-string +user-ask-question-character-limit+
                                     :initial-element #\q))
                      (option
                        (make-string +user-ask-option-character-limit+
                                     :initial-element #\o))
                      (normalized
                        (user-ask--normalize-questions
                         (vector
                          (json-object "question" prompt
                                       "options" (vector option "other"))))))
                 (test-assert
                  (and (= (length (getf (first normalized) :question))
                          +user-ask-question-character-limit+)
                       (= (length (first (getf (first normalized) :options)))
                          +user-ask-option-character-limit+))
                  "user.ask accepts text at its character limits")))
            (let ((serialized
                    (make-instance 'serialized-agent-observer
                                   :delegate observer)))
              (test-assert
               (equal (agent-observer-ask-user
                       serialized
                       (user-ask--normalize-questions
                        (gethash "questions" arguments)))
                      '("blue" "large"))
               "serialized observers forward structured questions"))
           (let* ((result (tool-execute tool context arguments))
                  (decoded (json-decode (tool-result-content result)))
                  (answers (gethash "answers" decoded)))
             (test-assert (tool-result-success-p result)
                          "user.ask succeeds with observer answers")
             (test-assert
              (and (= (length answers) 2)
                   (string= (gethash "question" (aref answers 0))
                            "Choose a color")
                   (string= (gethash "answer" (aref answers 0)) "blue")
                   (string= (gethash "answer" (aref answers 1)) "large"))
              "user.ask returns structured JSON answers"))
             (dolist
                 (oversized
                   (list
                    (json-object
                     "question"
                     (make-string (1+ +user-ask-question-character-limit+)
                                  :initial-element #\q)
                     "options" (vector "yes" "no"))
                    (json-object
                     "question" "Choose"
                     "options"
                     (vector
                      (make-string (1+ +user-ask-option-character-limit+)
                                   :initial-element #\o)
                      "other"))))
               (let ((calls-before ask-count)
                     (result
                       (tool-execute
                        tool context
                        (json-object "questions" (vector oversized)))))
                 (test-assert (not (tool-result-success-p result))
                              "user.ask rejects over-limit text")
                 (test-assert (= ask-count calls-before)
                              "user.ask rejects over-limit text before observer use")))
           (let ((result
                   (tool-execute
                    tool context
                    (json-object
                     "questions"
                     (vector
                      (json-object "question" "Duplicate"
                                   "options" (vector "same" "same")))))))
             (test-assert (not (tool-result-success-p result))
                          "user.ask rejects duplicate options"))
            (let* ((invalid-observer
                     (callback-agent-observer-create
                      :ask-user-callback
                      (lambda (questions)
                        (declare (ignore questions))
                        '("green" "large"))))
                   (invalid-context
                     (make-instance 'tool-context
                                    :configuration configuration
                                    :worker nil
                                    :conversation conversation
                                    :registry registry
                                    :observer invalid-observer))
                   (result (tool-execute tool invalid-context arguments)))
              (test-assert (not (tool-result-success-p result))
                           "user.ask rejects answers outside the offered options"))
           (let* ((silent-context
                    (make-instance 'tool-context
                                   :configuration configuration
                                   :worker nil
                                   :conversation conversation
                                   :registry registry
                                   :observer (make-instance 'agent-observer)))
                  (result (tool-execute tool silent-context arguments)))
             (test-assert (not (tool-result-success-p result))
                          "user.ask fails safely without an interactive observer")))
      (tool-registry-close-runtime-state registry)
      (uiop:delete-directory-tree root :validate t :if-does-not-exist ':ignore)))
  nil)


(-> test-user-ask-application () null)
(defun test-user-ask-application ()
  "Test terminal selection, cancellation, and reader pausing for user.ask."
  (let* ((terminal
           (make-instance 'scripted-terminal
                          :columns 60
                          :events (list ':history-next ':submit ':submit)))
         (ui (terminal-ui-create :terminal terminal))
         (application (make-instance 'application :ui ui))
         (questions
           '((:question "Choose a color" :options ("red" "blue"))
             (:question "Choose a size" :options ("small" "large"))))
         (pause-count 0))
    (with-terminal-ui (active-ui ui)
      (declare (ignore active-ui))
      (test-call-with-function-replacements
       (list
        (list 'terminal-interactive-p
              (lambda (ignored)
                (declare (ignore ignored))
                t))
        (list 'application-input-controller
              (lambda (ignored)
                (declare (ignore ignored))
                ':test-controller))
        (list 'application-input-controller-call-with-reader-paused
              (lambda (ignored function)
                (declare (ignore ignored))
                (incf pause-count)
                (funcall function))))
       (lambda ()
         (test-assert
          (equal (application-ask-user application questions)
                 '("blue" "small"))
          "application user questions select each answer in order")
         (test-assert (= pause-count 1)
                      "application user questions pause the terminal reader")
         (setf (scripted-terminal-events terminal)
               (list ':submit ':escape))
         (test-assert (null (application-ask-user application questions))
                      "application user questions cancel as one operation")))))
  nil)
