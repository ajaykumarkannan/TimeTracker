import { useState } from 'react';
import './Help.css';

interface FAQItem {
  question: string;
  answer: string;
}

const faqs: FAQItem[] = [
  {
    question: 'How do I start tracking time?',
    answer: 'Click the "Start" button on the Track tab, or use one of the quick-start category buttons to begin tracking immediately. You can add notes to describe what you\'re working on.'
  },
  {
    question: 'What\'s the difference between Guest and Account mode?',
    answer: 'Guest mode lets you start tracking immediately without registration. Your data is stored on the server with an anonymous session. Account mode requires registration but lets you access your data from any device and ensures your data is never lost.'
  },
  {
    question: 'Can I convert my guest session to an account?',
    answer: 'Yes! Go to Settings and fill out the "Create Account" form. All your existing time entries and categories will be preserved.'
  },
  {
    question: 'How do I create custom categories?',
    answer: 'Go to the Categories tab and click "Add Category". You can choose a name, color, and icon for your new category. Categories help you organize and analyze your time.'
  },
  {
    question: 'What happens when I\'m idle?',
    answer: 'ChronoFlow detects when you\'re inactive and will prompt you to either keep the idle time or discard it. This helps ensure accurate time tracking even if you step away.'
  },
  {
    question: 'How do I export my data?',
    answer: 'Go to Settings and use the "Export CSV" or "Export JSON" buttons. CSV is great for spreadsheets, while JSON includes all your data including categories.'
  },
  {
    question: 'Can I import time entries?',
    answer: 'Yes! You can import time entries from a CSV file in Settings. The CSV should have columns for date, duration, category, and notes. New categories will be created automatically.'
  },
  {
    question: 'How do I edit or delete a time entry?',
    answer: 'On the Track tab, find the entry in your history list. Click on it to expand and see edit/delete options. You can modify the duration, category, notes, or remove it entirely.'
  }
];

const keyboardShortcuts = [
  { keys: ['Space'], action: 'Start/Stop timer (when not in input)' },
  { keys: ['Esc'], action: 'Cancel current action' }
];

export function Help() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setExpandedFaq(expandedFaq === index ? null : index);
  };

  return (
    <div className="help">
      {/* Getting Started */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Getting Started</h2>
        </div>
        <div className="help-intro">
          <p>
            ChronoFlow helps you understand where your time goes. Track your work sessions, 
            organize them into categories, and gain insights through analytics.
          </p>
          <div className="help-steps">
            <div className="help-step">
              <span className="step-number">1</span>
              <div className="step-content">
                <h4>Start Tracking</h4>
                <p>Click Start or use a quick-start button to begin timing your work.</p>
              </div>
            </div>
            <div className="help-step">
              <span className="step-number">2</span>
              <div className="step-content">
                <h4>Organize</h4>
                <p>Assign categories and add notes to describe your activities.</p>
              </div>
            </div>
            <div className="help-step">
              <span className="step-number">3</span>
              <div className="step-content">
                <h4>Analyze</h4>
                <p>View your Analytics to see patterns and optimize your time.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Frequently Asked Questions</h2>
        </div>
        <div className="faq-list">
          {faqs.map((faq, index) => (
            <div 
              key={index} 
              className={`faq-item ${expandedFaq === index ? 'expanded' : ''}`}
            >
              <button 
                className="faq-question"
                onClick={() => toggleFaq(index)}
                aria-expanded={expandedFaq === index}
              >
                <span>{faq.question}</span>
                <svg 
                  className="faq-chevron" 
                  viewBox="0 0 24 24" 
                  width="20" 
                  height="20" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2"
                >
                  <polyline points="6,9 12,15 18,9" />
                </svg>
              </button>
              {expandedFaq === index && (
                <div className="faq-answer">
                  <p>{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Keyboard Shortcuts */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Keyboard Shortcuts</h2>
        </div>
        <div className="shortcuts-list">
          {keyboardShortcuts.map((shortcut, index) => (
            <div key={index} className="shortcut-item">
              <div className="shortcut-keys">
                {shortcut.keys.map((key, i) => (
                  <kbd key={i}>{key}</kbd>
                ))}
              </div>
              <span className="shortcut-action">{shortcut.action}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Contact & Feedback */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Need More Help?</h2>
        </div>
        <div className="help-contact">
          <p>
            If you have questions or feedback, we'd love to hear from you. ChronoFlow is 
            continuously improving based on user input.
          </p>
          <div className="help-links">
            <a 
              href="https://github.com/chronoflow/chronoflow/issues" 
              target="_blank" 
              rel="noopener noreferrer"
              className="help-link"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Report an Issue
            </a>
            <a 
              href="https://github.com/chronoflow/chronoflow" 
              target="_blank" 
              rel="noopener noreferrer"
              className="help-link"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              View on GitHub
            </a>
          </div>
        </div>
      </div>

      {/* Version Info */}
      <div className="help-version">
        <p>ChronoFlow v1.0.0</p>
      </div>
    </div>
  );
}
