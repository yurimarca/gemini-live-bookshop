/**
 * Demo Page Content Component
 *
 * Comprehensive demo page with interactive elements to test all 9 voice AI functions.
 * Sections:
 * 1. Hero Section (scrolling, clickElement)
 * 2. Registration Form (fillInput, selectOption, toggleCheckbox, submitForm, getFormData)
 * 3. Interactive Buttons (clickElement with diverse selectors)
 * 4. Product Cards (readPageContent, getPageStructure)
 * 5. Long Scrollable Content (scrollPage, readPageContent)
 * 6. Footer
 */

import { useState, FormEvent } from 'react';

export function DemoPageContent() {
  const [clickCount, setClickCount] = useState(0);
  const [formSubmitted, setFormSubmitted] = useState(false);

  /**
   * Handle form submission
   */
  const handleFormSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    console.log('Form submitted:', data);
    setFormSubmitted(true);
    setTimeout(() => setFormSubmitted(false), 3000);
  };

  /**
   * Handle button click
   */
  const handleButtonClick = (buttonId: string) => {
    console.log('Button clicked:', buttonId);
    if (buttonId === 'counter-btn') {
      setClickCount(prev => prev + 1);
    }
    if (buttonId === 'alert-button') {
      alert('Alert button clicked!');
    }
  };

  return (
    <div className="demo-content">
      {/* Section 1: Hero */}
      <section id="hero-section" className="min-h-screen relative flex items-center overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-mist-50">
          <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-brand-coral/20 rounded-full blur-[120px] animate-pulse-slow" />
          <div className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-brand-red/15 rounded-full blur-[120px] animate-pulse-slow delay-1000" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 py-16 z-10">
          <div className="max-w-4xl">
            <h1 id="main-heading" className="text-7xl font-display font-bold mb-6 leading-tight bg-gradient-to-r from-mist-900 via-mist-900 to-mist-700 bg-clip-text text-transparent animate-fade-in">
              Voice AI Function <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-red to-brand-coral">Testing Playground</span>
            </h1>
            <h2 className="text-3xl mb-8 font-light text-mist-700 animate-slide-up">
              Test all 9 DOM manipulation functions with natural voice commands
            </h2>
            <p className="max-w-2xl mb-10 text-lg leading-relaxed text-mist-700 animate-slide-up delay-100">
              This interactive demo page allows you to test voice-controlled interactions with web elements.
              Using advanced speech recognition and natural language processing, you can control this entire page using just your voice.
            </p>
            <div className="flex gap-4 animate-slide-up delay-200">
              <button
                id="hero-cta"
                onClick={() => console.log('Get Started clicked')}
                className="bg-brand-coral text-primary-foreground px-8 py-4 rounded-xl font-semibold text-lg hover:bg-brand-coral/90 transition-all shadow-lg shadow-brand-coral/25 hover:shadow-brand-coral/40 hover:-translate-y-1"
              >
                Get Started
              </button>
              <button
                className="learn-more-btn px-8 py-4 rounded-xl font-semibold text-lg border border-mist-900/10 bg-mist-900/5 hover:bg-mist-900/10 text-mist-900 transition-all hover:-translate-y-1 backdrop-blur-sm"
                onClick={() => console.log('Learn More clicked')}
              >
                Learn More
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Registration Form */}
      <section id="form-section" className="min-h-screen bg-mist-50 py-20 border-t border-mist-900/5">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-display font-bold mb-4 text-mist-900">Registration Form</h2>
            <p className="text-mist-700">
              Test form manipulation functions: fillInput, selectOption, toggleCheckbox, submitForm, getFormData
            </p>
          </div>

          {formSubmitted && (
            <div className="mb-6 p-4 bg-success-light border border-success-border text-success-foreground rounded-xl text-center backdrop-blur-sm">
              ✓ Form submitted successfully! Check the console for data.
            </div>
          )}

          <form
            id="registration-form"
            onSubmit={handleFormSubmit}
            className="bg-mist-900/5 backdrop-blur-xl p-10 rounded-3xl border border-mist-900/10 shadow-2xl space-y-8"
          >
            {/* Text Inputs */}
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <label htmlFor="name-input" className="block mb-2 font-medium text-mist-700">
                    Full Name
                  </label>
                  <input
                    id="name-input"
                    name="name"
                    type="text"
                    placeholder="John Doe"
                    className="w-full px-4 py-3 bg-mist-100/50 border border-mist-900/10 rounded-xl text-mist-900 placeholder-mist-600 focus:ring-2 focus:ring-brand-red/50 focus:border-transparent outline-none transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="email-input" className="block mb-2 font-medium text-mist-700">
                    Email Address
                  </label>
                  <input
                    id="email-input"
                    name="email"
                    type="email"
                    placeholder="john@example.com"
                    className="w-full px-4 py-3 bg-mist-100/50 border border-mist-900/10 rounded-xl text-mist-900 placeholder-mist-600 focus:ring-2 focus:ring-brand-red/50 focus:border-transparent outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label htmlFor="password-input" className="block mb-2 font-medium text-mist-700">
                    Password
                  </label>
                  <input
                    id="password-input"
                    name="password"
                    type="password"
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-mist-100/50 border border-mist-900/10 rounded-xl text-mist-900 placeholder-mist-600 focus:ring-2 focus:ring-brand-red/50 focus:border-transparent outline-none transition-all"
                  />
                </div>

                <div>
                  <label htmlFor="phone-input" className="block mb-2 font-medium text-mist-700">
                    Phone Number
                  </label>
                  <input
                    id="phone-input"
                    name="phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    className="w-full px-4 py-3 bg-mist-100/50 border border-mist-900/10 rounded-xl text-mist-900 placeholder-mist-600 focus:ring-2 focus:ring-brand-red/50 focus:border-transparent outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="bio-textarea" className="block mb-2 font-medium text-mist-700">
                Tell us about yourself
              </label>
              <textarea
                id="bio-textarea"
                name="bio"
                rows={4}
                placeholder="Share a bit about yourself..."
                className="w-full px-4 py-3 bg-mist-100/50 border border-mist-900/10 rounded-xl text-mist-900 placeholder-mist-600 focus:ring-2 focus:ring-brand-red/50 focus:border-transparent outline-none transition-all resize-none"
              />
            </div>

            {/* Select Dropdowns */}
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <label htmlFor="country-select" className="block mb-2 font-medium text-mist-700">
                  Country
                </label>
                <div className="relative">
                  <select
                    id="country-select"
                    name="country"
                    className="w-full px-4 py-3 bg-mist-100/50 border border-mist-900/10 rounded-xl text-mist-900 focus:ring-2 focus:ring-brand-red/50 focus:border-transparent outline-none appearance-none"
                  >
                    <option value="">Select Country</option>
                    <option value="USA">United States</option>
                    <option value="Canada">Canada</option>
                    <option value="UK">United Kingdom</option>
                    <option value="Germany">Germany</option>
                    <option value="France">France</option>
                    <option value="Japan">Japan</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="gender-select" className="block mb-2 font-medium text-mist-700">
                  Gender
                </label>
                <select
                  id="gender-select"
                  name="gender"
                  className="w-full px-4 py-3 bg-mist-100/50 border border-mist-900/10 rounded-xl text-mist-900 focus:ring-2 focus:ring-brand-red/50 focus:border-transparent outline-none appearance-none"
                >
                  <option value="">Select Gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="non-binary">Non-binary</option>
                  <option value="prefer-not-to-say">Prefer not to say</option>
                </select>
              </div>

              <div>
                <label htmlFor="interests-select" className="block mb-2 font-medium text-mist-700">
                  Primary Interest
                </label>
                <select
                  id="interests-select"
                  name="interests"
                  className="w-full px-4 py-3 bg-mist-100/50 border border-mist-900/10 rounded-xl text-mist-900 focus:ring-2 focus:ring-brand-red/50 focus:border-transparent outline-none appearance-none"
                >
                  <option value="">Select Interest</option>
                  <option value="technology">Technology</option>
                  <option value="arts">Arts</option>
                  <option value="sports">Sports</option>
                  <option value="music">Music</option>
                  <option value="science">Science</option>
                  <option value="business">Business</option>
                </select>
              </div>
            </div>

            {/* Checkboxes */}
            <div className="space-y-4 pt-4 border-t border-mist-900/5">
              <div className="flex items-center">
                <input
                  id="terms-checkbox"
                  name="terms"
                  type="checkbox"
                  className="w-5 h-5 text-brand-red bg-mist-100 border-mist-900/20 rounded focus:ring-brand-red/50 focus:ring-offset-0"
                />
                <label htmlFor="terms-checkbox" className="ml-3 text-mist-700">
                  I agree to the Terms and Conditions
                </label>
              </div>

              <div className="flex items-center">
                <input
                  id="newsletter-checkbox"
                  name="newsletter"
                  type="checkbox"
                  className="w-5 h-5 text-brand-red bg-mist-100 border-mist-900/20 rounded focus:ring-brand-red/50 focus:ring-offset-0"
                />
                <label htmlFor="newsletter-checkbox" className="ml-3 text-mist-700">
                  Subscribe to newsletter
                </label>
              </div>

              <div className="flex items-center">
                <input
                  id="updates-checkbox"
                  name="updates"
                  type="checkbox"
                  className="w-5 h-5 text-brand-red bg-mist-100 border-mist-900/20 rounded focus:ring-brand-red/50 focus:ring-offset-0"
                />
                <label htmlFor="updates-checkbox" className="ml-3 text-mist-700">
                  Receive product updates
                </label>
              </div>
            </div>

            {/* Submit Button */}
            <button
              id="submit-registration"
              type="submit"
              className="w-full bg-gradient-to-r from-brand-red to-brand-coral text-primary-foreground py-4 rounded-xl font-semibold text-lg hover:brightness-110 transition-all shadow-lg hover:shadow-brand-coral/25"
            >
              Create Account
            </button>
          </form>
        </div>
      </section>

      {/* Section 3: Interactive Buttons */}
      <section id="buttons-section" className="min-h-screen bg-mist-100 py-20 border-t border-mist-900/5">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-display font-bold mb-4 text-mist-900">Interactive Buttons</h2>
            <p className="text-mist-700">
              Test clickElement function with diverse selectors: IDs, classes, text content, and more
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            <button
              id="primary-action"
              onClick={() => handleButtonClick('primary-action')}
              className="px-6 py-4 bg-mist-300 text-mist-900 rounded-xl font-semibold hover:bg-mist-300/80 transition-colors shadow-lg shadow-mist-300/20"
            >
              Primary Action
            </button>

            <button
              id="secondary-action"
              onClick={() => handleButtonClick('secondary-action')}
              className="px-6 py-4 bg-mist-900/10 text-mist-900 rounded-xl font-semibold hover:bg-mist-900/20 transition-colors backdrop-blur-sm"
            >
              Secondary Action
            </button>

            <button
              className="danger-btn px-6 py-4 bg-error/80 text-primary-foreground rounded-xl font-semibold hover:bg-error transition-colors shadow-lg shadow-error/20"
              onClick={() => handleButtonClick('danger-btn')}
            >
              Delete Item
            </button>

            <button
              className="success-btn px-6 py-4 bg-success/80 text-primary-foreground rounded-xl font-semibold hover:bg-success transition-colors shadow-lg shadow-success/20"
              onClick={() => handleButtonClick('success-btn')}
            >
              Confirm
            </button>

            <button
              data-testid="alert-button"
              onClick={() => handleButtonClick('alert-button')}
              className="px-6 py-4 bg-warning/80 text-primary-foreground rounded-xl font-semibold hover:bg-warning transition-colors shadow-lg shadow-warning/20"
            >
              Show Alert
            </button>

            <button
              onClick={() => handleButtonClick('click-me')}
              className="px-6 py-4 bg-brand-coral text-primary-foreground rounded-xl font-semibold hover:bg-brand-coral/90 transition-colors shadow-lg shadow-brand-coral/20"
            >
              Click Me!
            </button>

            <button
              onClick={() => handleButtonClick('toggle-feature')}
              className="px-6 py-4 bg-info text-primary-foreground rounded-xl font-semibold hover:bg-info/90 transition-colors shadow-lg"
            >
              Toggle Feature
            </button>

            <div className="flex items-center justify-center">
              <button
                onClick={() => handleButtonClick('nested-button')}
                className="px-6 py-4 bg-brand-charcoal text-primary-foreground rounded-xl font-semibold hover:bg-brand-charcoal/90 transition-colors shadow-lg shadow-brand-charcoal/20"
              >
                Nested Button
              </button>
            </div>

            <button
              aria-label="settings"
              onClick={() => handleButtonClick('settings-btn')}
              className="px-6 py-4 bg-mist-900/5 text-mist-900 rounded-xl font-semibold hover:bg-mist-900/10 transition-colors border border-mist-900/10 text-2xl"
            >
              ⚙️
            </button>

            <button
              className="outline-btn px-6 py-4 border-2 border-brand-red text-brand-red rounded-xl font-semibold hover:bg-brand-red/10 transition-colors"
              onClick={() => handleButtonClick('outline-btn')}
            >
              Outline Style
            </button>

            <button
              id="counter-btn"
              onClick={() => handleButtonClick('counter-btn')}
              className="px-6 py-4 bg-mist-700 text-primary-foreground rounded-xl font-semibold hover:bg-mist-900 transition-colors shadow-lg"
            >
              Click Count: {clickCount}
            </button>

            <button
              className="disabled-btn px-6 py-4 bg-mist-900/5 text-mist-600 rounded-xl font-semibold cursor-not-allowed border border-mist-900/5"
              disabled
            >
              Disabled Button
            </button>
          </div>
        </div>
      </section>

      {/* Section 4: Product Cards */}
      <section id="cards-section" className="min-h-screen bg-mist-50 py-20 border-t border-mist-900/5">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-display font-bold mb-4 text-mist-900">Pricing Plans</h2>
            <p className="text-mist-700">
              Test readPageContent and getPageStructure functions with structured content
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Premium Plan */}
            <div className="bg-mist-900/5 rounded-3xl p-8 border border-mist-900/10 hover:border-brand-red/50 transition-colors backdrop-blur-md group">
              <h3 className="text-2xl font-bold mb-4 text-mist-900 group-hover:text-brand-red transition-colors">Premium Plan</h3>
              <p className="text-mist-700 mb-6 min-h-[80px]">
                Best for professionals who need advanced features and priority support.
              </p>
              <p className="text-5xl font-bold text-mist-900 mb-6">$99<span className="text-lg text-mist-600">/mo</span></p>
              <button
                id="buy-premium"
                onClick={() => console.log('Buy Premium clicked')}
                className="w-full bg-mist-900/10 text-mist-900 py-4 rounded-xl font-semibold hover:bg-brand-red hover:text-primary-foreground transition-all"
              >
                Buy Now
              </button>
            </div>

            {/* Business Plan */}
            <div className="bg-gradient-to-b from-brand-coral/20 to-mist-900/5 rounded-3xl p-8 border border-brand-coral/50 relative backdrop-blur-md transform scale-105 shadow-2xl shadow-brand-coral/10">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 bg-brand-coral text-primary-foreground px-4 py-1 rounded-full text-sm font-bold shadow-lg shadow-brand-coral/40">
                Most Popular
              </div>
              <h3 className="text-2xl font-bold mb-4 text-mist-900">Business Plan</h3>
              <p className="text-mist-700 mb-6 min-h-[80px]">
                Perfect for teams. Unlimited projects, priority support, and advanced security.
              </p>
              <p className="text-5xl font-bold text-brand-coral mb-6">$199<span className="text-lg text-mist-700">/mo</span></p>
              <button
                id="buy-business"
                onClick={() => console.log('Buy Business clicked')}
                className="w-full bg-brand-coral text-primary-foreground py-4 rounded-xl font-semibold hover:bg-brand-coral/90 transition-all shadow-lg hover:shadow-brand-coral/25"
              >
                Buy Now
              </button>
            </div>

            {/* Enterprise Plan */}
            <div className="bg-mist-900/5 rounded-3xl p-8 border border-mist-900/10 hover:border-brand-charcoal/50 transition-colors backdrop-blur-md group">
              <h3 className="text-2xl font-bold mb-4 text-mist-900 group-hover:text-brand-charcoal transition-colors">Enterprise Plan</h3>
              <p className="text-mist-700 mb-6 min-h-[80px]">
                Custom solutions for large organizations. SLA guarantees and dedicated support.
              </p>
              <p className="text-5xl font-bold text-mist-900 mb-6">Custom</p>
              <button
                id="contact-sales"
                onClick={() => console.log('Contact Sales clicked')}
                className="w-full bg-mist-900/10 text-mist-900 py-4 rounded-xl font-semibold hover:bg-brand-charcoal hover:text-primary-foreground transition-all"
              >
                Contact Sales
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 5: Long Scrollable Content */}
      <section id="content-section" className="min-h-screen bg-mist-100 py-20 border-t border-mist-900/5">
        <div className="max-w-4xl mx-auto px-4 space-y-16">
          <div className="bg-mist-900/5 rounded-3xl p-10 border border-mist-900/5 backdrop-blur-sm">
            <h2 id="intro-heading" className="text-4xl font-display font-bold mb-6 text-mist-900 border-b border-mist-900/10 pb-6">
              Introduction to Voice AI
            </h2>
            <div className="text-mist-700 text-lg leading-relaxed space-y-6">
              <p>
                Voice AI technology has revolutionized the way we interact with computers and digital devices.
                By leveraging advanced natural language processing and machine learning algorithms, modern voice assistants
                can understand and execute complex commands with remarkable accuracy.
              </p>
              <p>
                The foundation of voice AI lies in deep neural networks that have been trained on vast amounts of audio data.
                These models can recognize speech patterns, understand context, and even detect emotional nuances in human speech.
              </p>
            </div>

            <h3 className="text-2xl font-semibold mt-10 mb-4 text-brand-red">
              Understanding Natural Language Processing
            </h3>
            <p className="text-mist-700 text-lg leading-relaxed">
              Natural Language Processing (NLP) is the backbone of voice AI systems. It enables computers to understand,
              interpret, and generate human language in a valuable way. NLP combines computational linguistics with statistical,
              machine learning, and deep learning models.
            </p>
          </div>

          <div className="bg-mist-900/5 rounded-3xl p-10 border border-mist-900/5 backdrop-blur-sm">
            <h2 id="how-it-works-heading" className="text-4xl font-display font-bold mb-6 text-mist-900 border-b border-mist-900/10 pb-6">
              How It Works
            </h2>
            <p className="text-mist-700 text-lg leading-relaxed mb-6">
              The voice AI system operates through a sophisticated pipeline of interconnected components. First, audio input
              is captured through a microphone and converted into digital signals. These signals are then processed through
              multiple stages of analysis.
            </p>

            <div className="grid md:grid-cols-2 gap-8 mt-8">
              <div className="bg-mist-900/5 p-6 rounded-2xl border border-mist-900/5">
                <h3 className="text-xl font-semibold mb-3 text-brand-coral">Audio Pipeline</h3>
                <p className="text-mist-700">
                  Signal preprocessing cleans audio, removing background noise and enhancing speech clarity for precise recognition.
                </p>
              </div>
              <div className="bg-mist-900/5 p-6 rounded-2xl border border-mist-900/5">
                <h3 className="text-xl font-semibold mb-3 text-brand-charcoal">Function Execution</h3>
                <p className="text-mist-700">
                  Natural language commands are mapped to API calls or DOM manipulations, executing user intents instantly.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 6: Footer */}
      <footer id="footer-section" className="bg-mist-200 text-mist-900 py-16 border-t border-mist-900/10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-12">
            <div>
              <h4 className="font-bold text-lg mb-4 text-brand-red">About</h4>
              <p className="text-mist-700 leading-relaxed">
                Voice AI Function Calling Demo - A comprehensive testing platform for voice-controlled
                web interactions.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-lg mb-4 text-brand-red">Links</h4>
              <ul className="space-y-3 text-mist-700">
                <li><a href="#" className="hover:text-mist-900 transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-mist-900 transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-mist-900 transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-lg mb-4 text-brand-red">Follow Us</h4>
              <div className="flex gap-6">
                <a href="#" className="text-mist-700 hover:text-mist-900 transition-colors">Twitter</a>
                <a href="#" className="text-mist-700 hover:text-mist-900 transition-colors">GitHub</a>
                <a href="#" className="text-mist-700 hover:text-mist-900 transition-colors">LinkedIn</a>
              </div>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-mist-900/10 text-center text-mist-600">
            <p>&copy; 2025 Voice AI Demo. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
