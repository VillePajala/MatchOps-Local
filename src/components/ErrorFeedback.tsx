'use client';

import React, { useState, useEffect } from 'react';
import { HiOutlineChatBubbleLeftEllipsis, HiOutlineXMark } from 'react-icons/hi2';

interface ErrorFeedbackProps {
  error?: Error | null;
}

export default function ErrorFeedback({ error }: ErrorFeedbackProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Handle auto-close timeout with proper cleanup
  useEffect(() => {
    if (submitted) {
      const timeout = setTimeout(() => {
        setIsOpen(false);
        setSubmitted(false);
        setFeedback('');
        setEmail('');
        setSubmitError(null);
      }, 2000);

      return () => clearTimeout(timeout);
    }
  }, [submitted]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      setIsOpen(false);
      setSubmitted(false);
      setFeedback('');
      setEmail('');
      setSubmitError(null);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Dynamically import Sentry to reduce bundle size
      const { captureMessage } = await import('@/lib/sentry');
      
      // Send feedback to Sentry
      captureMessage('User Error Feedback', 'info', {
        feedback: feedback.trim(),
        email: email.trim() || 'anonymous',
        errorMessage: error?.message || 'Unknown error',
        errorStack: error?.stack || 'No stack trace',
        timestamp: new Date().toISOString(),
      });

      setSubmitted(true);
    } catch (err) {
      console.error('Failed to send feedback:', err);
      setSubmitError('Failed to send feedback. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-md font-medium transition-colors"
      >
        <HiOutlineChatBubbleLeftEllipsis className="w-4 h-4" />
        Send Feedback
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-200">
            Report this Error
          </h3>
          <button
            onClick={() => setIsOpen(false)}
            className="text-slate-400 hover:text-slate-300 transition-colors"
          >
            <HiOutlineXMark className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="text-center py-4">
            <div className="text-green-400 mb-2">✓</div>
            <p className="text-slate-300">Thank you for your feedback!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {submitError && (
              <div className="mb-4 p-3 bg-red-900/20 border border-red-600/30 rounded-md">
                <p className="text-red-400 text-sm">{submitError}</p>
              </div>
            )}
            <div className="mb-4">
              <label htmlFor="feedback" className="block text-sm font-medium text-slate-300 mb-2">
                What happened? (Optional)
              </label>
              <textarea
                id="feedback"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Describe what you were doing when the error occurred..."
                className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md text-slate-200 placeholder-slate-400 resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                rows={3}
              />
            </div>

            <div className="mb-4">
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                Email (Optional)
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md text-slate-200 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <p className="text-xs text-slate-500 mt-1">
                Only if you&apos;d like us to follow up with you
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-800 text-white rounded-md font-medium transition-colors"
              >
                {isSubmitting ? 'Sending...' : 'Send Feedback'}
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-md font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}