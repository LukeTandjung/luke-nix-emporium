(in-package #:autolith)

;;;; -- Structured User Questions --

(defconstant +user-ask-question-character-limit+ 1024
  "Maximum number of characters in one user.ask question.")

(defconstant +user-ask-option-character-limit+ 256
  "Maximum number of characters in one user.ask option.")

(defclass user-ask-tool (tool)
  ()
  (:documentation "Ask the local user a bounded set of multiple-choice questions."))

(defmethod tool-child-safe-p ((tool user-ask-tool))
  "Keep interactive user questions on the primary agent."
  (declare (ignore tool))
  nil)

(defmethod tool-provider-round-trip-barrier-p ((tool user-ask-tool))
  "Require the provider to observe the user's answers before further calls."
  (declare (ignore tool))
  t)

(defmethod tool-execution-policy ((tool user-ask-tool))
  "Give the modal terminal selector exclusive execution."
  (declare (ignore tool))
  ':exclusive)

(-> user-ask--sequence-list (t string) list)
(defun user-ask--sequence-list (value description)
  "Return VALUE as a proper list, or signal a bounded tool error."
  (typecase value
    (list value)
    (vector (coerce value 'list))
    (t
     (error 'tool-error
            :tool-name "user.ask"
            :message description))))

(-> user-ask--normalize-questions (t) list)
(defun user-ask--normalize-questions (value)
  "Validate and return the bounded question and option string lists."
  (let ((questions
          (user-ask--sequence-list
           value "user.ask requires an array of 1 to 4 questions.")))
    (unless (<= 1 (length questions) 4)
      (error 'tool-error
             :tool-name "user.ask"
             :message "user.ask requires 1 to 4 questions."))
    (loop
      for question in questions
      for index from 1
      collect
      (progn
        (unless (json-object-p question)
          (error 'tool-error
                 :tool-name "user.ask"
                 :message (format nil "Question ~D must be an object." index)))
        (let* ((prompt (gethash "question" question))
               (options
                 (user-ask--sequence-list
                  (gethash "options" question)
                  (format nil "Question ~D requires an options array." index))))
          (unless (non-empty-string-p prompt)
            (error 'tool-error
                   :tool-name "user.ask"
                   :message (format nil "Question ~D requires non-empty text." index)))
            (when (> (length prompt) +user-ask-question-character-limit+)
              (error 'tool-error
                     :tool-name "user.ask"
                     :message
                     (format nil "Question ~D text exceeds ~D characters."
                             index +user-ask-question-character-limit+)))
          (unless (<= 2 (length options) 4)
            (error 'tool-error
                   :tool-name "user.ask"
                   :message (format nil "Question ~D requires 2 to 4 options." index)))
          (unless (every #'non-empty-string-p options)
            (error 'tool-error
                   :tool-name "user.ask"
                   :message (format nil "Question ~D options must be non-empty strings." index)))
            (unless (every (lambda (option)
                             (<= (length option)
                                 +user-ask-option-character-limit+))
                           options)
              (error 'tool-error
                     :tool-name "user.ask"
                     :message
                     (format nil "Question ~D options cannot exceed ~D characters."
                             index +user-ask-option-character-limit+)))
          (unless (= (length options)
                     (length (remove-duplicates options :test #'string=)))
            (error 'tool-error
                   :tool-name "user.ask"
                   :message (format nil "Question ~D options must be unique." index)))
          (list :question prompt :options options))))))

(-> user-ask--answers-json (list list) string)
(defun user-ask--answers-json (questions answers)
  "Encode QUESTIONS and selected ANSWERS as one structured JSON result."
  (json-encode
   (json-object
    "answers"
    (coerce
     (loop for question in questions
           for answer in answers
           collect
           (json-object "question" (getf question :question)
                        "answer" answer))
     'vector))))

(-> user-ask--valid-answers-p (list t) boolean)
(defun user-ask--valid-answers-p (questions answers)
  "Return true when ANSWERS selects one offered option for every question."
  (and (listp answers)
       (= (length answers) (length questions))
       (every #'non-empty-string-p answers)
       (loop for question in questions
             for answer in answers
             always (member answer (getf question :options) :test #'string=))))

(defmethod tool-execute
    ((tool user-ask-tool) (context tool-context) (arguments hash-table))
  "Validate QUESTIONS, ask through the active observer, and return JSON answers."
  (declare (ignore tool))
  (handler-case
      (let* ((questions
               (user-ask--normalize-questions
                (gethash "questions" arguments)))
             (answers
               (agent-observer-ask-user
                (tool-context-observer context) questions)))
        (if (user-ask--valid-answers-p questions answers)
            (tool-success (user-ask--answers-json questions answers))
            (tool-failure
             "user.ask was cancelled, unavailable, or returned an invalid selection.")))
    (autolith-error (condition)
      (tool-failure (autolith-error-message condition)))
    (serious-condition (condition)
      (tool-failure
       (format nil "user.ask failed safely: ~A" condition)))))
