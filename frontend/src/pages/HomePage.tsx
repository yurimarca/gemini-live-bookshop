/**
 * Landing page: hero, agent capabilities, dataset overview, benefits.
 */

import { Link } from 'react-router-dom';
import { useEcommerceStore } from '../hooks/useEcommerceStore';
import { useEffect, useState, useRef } from 'react';
import type { Book } from '../types/book';
import { Mic, BookOpen, ShoppingCart, LayoutGrid, ArrowRight, Zap, Globe, Sparkles, Languages } from 'lucide-react';
import { motion } from 'framer-motion';
import { START_VOICE_DEMO_EVENT } from '../components/VoiceSession/FloatingVoiceWidget';
import { ScrollytellingDemoFlow } from '../components/DemoPages/ScrollytellingDemoFlow';

const CAPABILITY_STAGGER_MS = 550;
const CAPABILITY_RESET_DELAY_MS = 7500;
const DEMO_STEP_RESET_DELAY_MS = 7500;

const DEMO_FLOW_SCROLL_DURATION_MS = 18000;
const DEMO_FLOW_SCROLL_SETTLE_MS = 700;

const CAPABILITY_CARDS = [
  { icon: Mic, title: 'Search by voice', description: 'Ask for books by category or keyword and see results on the search page.' },
  { icon: BookOpen, title: 'Book details & view', description: 'Get details about any book and open its page so you see it on screen.' },
  { icon: ShoppingCart, title: 'Cart & checkout', description: 'Add or remove items and complete the purchase by voice; cart updates in real time.' },
  { icon: LayoutGrid, title: 'Results on screen', description: 'The agent navigates the app so you hear the answer and see it—search results, cart, book pages.' },
] as const;

function BookCard({ book }: { book: Book }) {
  return (
    <motion.div
      whileHover={{ y: -8, scale: 1.02 }}
      className="bg-mist-900/5 backdrop-blur-sm rounded-2xl border border-mist-900/10 shadow-lg hover:shadow-brand-coral/20 hover:border-brand-coral/30 transition-all duration-300 p-4 flex flex-col group h-full"
    >
      <div className="relative overflow-hidden rounded-xl mb-4 aspect-[2/3]">
        {book.imageUrl ? (
          <img
            src={book.imageUrl}
            alt={book.title}
            className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-mist-100 flex items-center justify-center text-mist-600 text-sm">
            No image
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-overlay-dark via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
          <Link
            to={`/book/${encodeURIComponent(book.id)}`}
            className="w-full py-2 text-center text-sm font-semibold rounded-lg bg-brand-coral text-primary-foreground shadow-lg shadow-brand-coral/20 hover:bg-brand-coral/90 transition-colors"
          >
            View Details
          </Link>
        </div>
      </div>

      <h3 className="font-bold text-mist-900 line-clamp-2 mb-2 group-hover:text-brand-red transition-colors">{book.title}</h3>
      <p className="text-brand-coral font-bold text-lg mb-2">${book.price.toFixed(2)}</p>
      <p className="text-xs text-mist-600 uppercase tracking-wider">{book.category}</p>
    </motion.div>
  );
}

function AnimatedBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
      <div className="absolute top-[-5%] right-[10%] w-[600px] h-[600px] rounded-full bg-brand-coral/10 blur-[140px]" />
    </div>
  );
}

const WAVEFORM_HEIGHTS = [30, 55, 75, 45, 85, 60, 90, 50, 70, 40, 80, 55, 65, 35, 75, 50, 60, 85, 45, 70];
const WAVEFORM_DURATIONS = [1.4, 1.8, 1.2, 1.6, 1.3, 1.9, 1.5, 1.7, 1.2, 1.8, 1.4, 1.6, 1.3, 1.9, 1.5, 1.2, 1.7, 1.4, 1.8, 1.3];
const WAVEFORM_DELAYS = [0, 0.1, 0.2, 0.05, 0.15, 0.25, 0.08, 0.18, 0.28, 0.03, 0.13, 0.23, 0.07, 0.17, 0.27, 0.04, 0.14, 0.24, 0.09, 0.19];

function VoiceWaveVisualization() {
  return (
    <div className="relative flex flex-col items-center justify-center w-full h-full min-h-[320px] select-none">
      {/* Pulse rings */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          animate={{ scale: [1, 1.8, 1], opacity: [0.35, 0, 0.35] }}
          transition={{ duration: 3.5, repeat: Infinity, delay: i * 1.1, ease: "easeOut" }}
          className="absolute w-32 h-32 rounded-full border border-brand-red/25"
        />
      ))}

      {/* Center orb */}
      <div className="relative z-10 w-28 h-28 rounded-full bg-brand-coral/20 border border-brand-coral/30 flex items-center justify-center backdrop-blur-sm shadow-[0_0_40px_rgba(233,123,98,0.2)]">
        <div className="w-16 h-16 rounded-full bg-brand-coral/30 flex items-center justify-center">
          <Mic className="w-8 h-8 text-brand-red" />
        </div>
      </div>

      {/* Audio bars */}
      <div className="absolute bottom-6 flex items-end justify-center gap-1 h-16">
        {WAVEFORM_HEIGHTS.map((h, i) => (
          <motion.div
            key={i}
            animate={{ scaleY: [0.25, 1, 0.25] }}
            transition={{ duration: WAVEFORM_DURATIONS[i], repeat: Infinity, delay: WAVEFORM_DELAYS[i], ease: "easeInOut" }}
            className="w-1.5 rounded-full bg-gradient-to-t from-brand-coral to-brand-red origin-bottom"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: 0.5 } }
};

export function HomePage() {
  const { searchBooks, getCatalogStats } = useEcommerceStore();
  const [sampleBooks, setSampleBooks] = useState<Book[]>([]);
  const [stats, setStats] = useState<{ totalBooks: number; categories: string[] } | null>(null);
  const [runCapabilityAnimation, setRunCapabilityAnimation] = useState(false);
  const capabilitiesSectionRef = useRef<HTMLElement>(null);
  const [runWhyVoiceAnimation, setRunWhyVoiceAnimation] = useState(false);
  const whyVoiceSectionRef = useRef<HTMLElement>(null);
  const [highlightedDemoStep, setHighlightedDemoStep] = useState<number | null>(null);
  const demoFlowSectionRef = useRef<HTMLElement>(null);
  const demoFlowScrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    searchBooks(undefined, undefined).then((books) => setSampleBooks(books.slice(0, 8)));
  }, [searchBooks]);

  useEffect(() => {
    getCatalogStats().then(setStats);
  }, [getCatalogStats]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      capabilitiesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setRunCapabilityAnimation(true);
      timeoutId = setTimeout(() => setRunCapabilityAnimation(false), CAPABILITY_RESET_DELAY_MS);
    };
    window.addEventListener('highlightCapabilities', handler);
    return () => {
      window.removeEventListener('highlightCapabilities', handler);
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      whyVoiceSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setRunWhyVoiceAnimation(true);
      timeoutId = setTimeout(() => setRunWhyVoiceAnimation(false), CAPABILITY_RESET_DELAY_MS);
    };
    window.addEventListener('highlightWhyVoice', handler);
    return () => {
      window.removeEventListener('highlightWhyVoice', handler);
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const handler = (e: Event) => {
      const step = (e as CustomEvent<{ step: number }>).detail?.step;
      if (typeof step === 'number' && step >= 1 && step <= 6) {
        demoFlowSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightedDemoStep(step);
        timeoutId = setTimeout(() => setHighlightedDemoStep(null), DEMO_STEP_RESET_DELAY_MS);
      }
    };
    window.addEventListener('highlightDemoStep', handler);
    return () => {
      window.removeEventListener('highlightDemoStep', handler);
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    const runSmoothScrollToEnd = () => {
      const section = demoFlowSectionRef.current;
      if (!section) return;
      const startY = window.scrollY;
      const rect = section.getBoundingClientRect();
      const sectionBottom = rect.bottom + window.scrollY;
      const endY = Math.min(
        sectionBottom - window.innerHeight,
        document.documentElement.scrollHeight - window.innerHeight
      );
      if (endY <= startY) return;
      const duration = DEMO_FLOW_SCROLL_DURATION_MS;
      const startTime = performance.now();
      const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
      const tick = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(1, elapsed / duration);
        const eased = easeInOut(t);
        window.scrollTo(0, startY + (endY - startY) * eased);
        if (t < 1) {
          demoFlowScrollRafRef.current = requestAnimationFrame(tick);
        }
      };
      demoFlowScrollRafRef.current = requestAnimationFrame(tick);
    };
    let settleTimeoutId: ReturnType<typeof setTimeout> | null = null;
    const onEvent = () => {
      demoFlowSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      settleTimeoutId = setTimeout(runSmoothScrollToEnd, DEMO_FLOW_SCROLL_SETTLE_MS);
    };
    window.addEventListener('highlightDemoFlowScroll', onEvent);
    return () => {
      window.removeEventListener('highlightDemoFlowScroll', onEvent);
      if (settleTimeoutId != null) clearTimeout(settleTimeoutId);
      if (demoFlowScrollRafRef.current != null) {
        cancelAnimationFrame(demoFlowScrollRafRef.current);
        demoFlowScrollRafRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-clip">
      <AnimatedBackground />

      {/* Hero Section */}
      <section className="relative pt-16 pb-16 md:pt-24 md:pb-24 px-4 max-w-7xl mx-auto z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
          {/* Left: text content */}
          <div className="flex flex-col items-start">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="mb-6 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-mist-900/5 border border-brand-red/40 text-brand-red text-sm font-medium backdrop-blur-md"
            >
              <Sparkles className="w-4 h-4" />
              <span>Next-Generation System Interaction</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
              className="text-5xl md:text-6xl font-display font-bold text-mist-900 mb-6 tracking-tight leading-tight"
            >
              Voice + LLM that{' '}
              <span
                className="text-transparent bg-clip-text bg-gradient-to-r from-brand-red to-brand-coral bg-[length:200%_auto] animate-gradient-x"
              >
                drives your system
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="text-mist-700 text-lg max-w-xl mb-5 leading-relaxed"
            >
              Real-time voice with Gemini Live and ADK. The agent calls tools, your frontend updates live — all by speech.
            </motion.p>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.38 }}
              className="text-brand-red/90 text-sm max-w-md mb-10 font-medium"
            >
              Ask: <span className="text-mist-900 italic">&ldquo;How should we proceed?&rdquo;</span> to be guided through the demo flow
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.5 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <button
                type="button"
                onClick={() => {
                  document.getElementById('demo-flow')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  window.dispatchEvent(new CustomEvent(START_VOICE_DEMO_EVENT));
                }}
                className="group relative inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-bold bg-brand-coral text-primary-foreground overflow-hidden transition-all duration-300 hover:shadow-[0_0_24px_rgba(233,123,98,0.5)] hover:-translate-y-1"
              >
                <span className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-primary-foreground/20 to-transparent -translate-x-full group-hover:animate-shimmer" />
                Try the Demo <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <a
                href="#capabilities"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-bold bg-mist-900/5 text-mist-900 border border-mist-900/10 hover:bg-mist-900/10 transition-all duration-300"
              >
                Learn More
              </a>
            </motion.div>
          </div>

          {/* Right: voice visualization */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
            className="hidden lg:block"
          >
            <VoiceWaveVisualization />
          </motion.div>
        </div>
      </section>

      {/* Demo flow section - scrollytelling reveal */}
      <section ref={demoFlowSectionRef} id="demo-flow" className="relative z-10 w-full mb-10">
        <ScrollytellingDemoFlow highlightedDemoStep={highlightedDemoStep} sampleBooks={sampleBooks} />
      </section>

      {/* Capabilities Section */}
      <section ref={capabilitiesSectionRef} id="capabilities" className="py-20 bg-mist-100/50 backdrop-blur-sm relative z-10">
        <div className="max-w-7xl mx-auto px-4">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={containerVariants}
          >
            <motion.h2 variants={itemVariants} className="text-3xl md:text-4xl font-display font-bold text-mist-900 mb-12 text-center">
              What the agent can do
            </motion.h2>

            <div className="flex flex-col gap-6">
              {/* Featured first card — full width, horizontal */}
              {(() => {
                const { icon: Icon, title, description } = CAPABILITY_CARDS[0];
                return (
                  <motion.div
                    variants={itemVariants}
                    whileHover={{ y: -3 }}
                    className={`bg-mist-900/5 rounded-2xl border border-brand-red/20 p-8 flex flex-col md:flex-row items-start gap-6 hover:bg-mist-900/8 hover:border-brand-red/40 transition-all duration-300 ${runCapabilityAnimation ? 'animate-capability-highlight' : ''}`}
                    style={runCapabilityAnimation ? { animationDelay: '0ms' } : undefined}
                  >
                    <div className="w-16 h-16 rounded-xl bg-brand-red/15 flex-shrink-0 flex items-center justify-center text-brand-red shadow-[0_0_24px_rgba(206,69,50,0.12)]">
                      <Icon className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="font-bold text-2xl text-mist-900 mb-3">{title}</h3>
                      <p className="text-mist-700 leading-relaxed max-w-2xl">{description}</p>
                    </div>
                  </motion.div>
                );
              })()}

              {/* Remaining 3 cards — 3-col grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {([
                  { colorClass: 'bg-brand-coral/15 text-brand-coral shadow-[0_0_20px_rgba(233,123,98,0.12)]', borderClass: 'hover:border-brand-coral/40' },
                  { colorClass: 'bg-brand-charcoal/15 text-brand-charcoal shadow-[0_0_20px_rgba(32,29,27,0.10)]', borderClass: 'hover:border-brand-charcoal/40' },
                  { colorClass: 'bg-mist-900/10 text-mist-900', borderClass: 'hover:border-mist-900/30' },
                ] as const).map(({ colorClass, borderClass }, i) => {
                  const { icon: Icon, title, description } = CAPABILITY_CARDS[i + 1];
                  const index = i + 1;
                  return (
                    <motion.div
                      key={title}
                      variants={itemVariants}
                      whileHover={{ y: -5 }}
                      className={`bg-mist-900/5 rounded-2xl border border-mist-900/10 p-6 ${borderClass} hover:bg-mist-900/8 transition-all duration-300 ${runCapabilityAnimation ? 'animate-capability-highlight' : ''}`}
                      style={runCapabilityAnimation ? { animationDelay: `${index * CAPABILITY_STAGGER_MS}ms` } : undefined}
                    >
                      <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${colorClass}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <h3 className="font-bold text-xl text-mist-900 mb-3">{title}</h3>
                      <p className="text-mist-700 text-sm leading-relaxed">{description}</p>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Benefits Section */}
      <section ref={whyVoiceSectionRef} id="why-voice" className="py-24 max-w-7xl mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center"
        >
          <h2 className="text-3xl md:text-4xl font-display font-bold text-mist-900 mb-4">Why Voice + LLM?</h2>
          <p className="text-mist-700 max-w-2xl mx-auto">Transforming static interfaces into active, intelligent partners.</p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-px bg-mist-900/10 rounded-2xl overflow-hidden mb-24">
          {[
            { title: "Hands-Free Control", desc: "Browse, filter, and checkout purely by voice. Ideal for multitasking or accessibility.", icon: Mic },
            { title: "Natural Intent", desc: "No more navigating complex menus. Just say 'Show me sci-fi books under $15' and it happens.", icon: Zap },
            { title: "Real-Time Sync", desc: "The agent sees what you see. The UI updates instantly as the agent takes action.", icon: Globe },
            { title: "Multi-language", desc: "Have the conversation in your preferred language and switch anytime — no separate settings or restarts.", icon: Languages },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.12, duration: 0.5 }}
              className={`bg-mist-50 p-10 flex flex-col gap-5 hover:bg-mist-100/60 transition-colors ${runWhyVoiceAnimation ? 'animate-capability-highlight' : ''}`}
              style={runWhyVoiceAnimation ? { animationDelay: `${i * CAPABILITY_STAGGER_MS}ms` } : undefined}
            >
              <span className="text-5xl font-display font-bold text-mist-900/8 leading-none select-none">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="w-11 h-11 rounded-lg bg-brand-coral/15 flex items-center justify-center text-brand-coral">
                <item.icon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-mist-900 mb-2">{item.title}</h3>
                <p className="text-mist-700 text-sm leading-relaxed">{item.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Catalog & Sample Books */}
      <section id="explore-catalog" className="py-20 bg-gradient-to-b from-transparent to-mist-50/80 relative z-10">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
            <div>
              <h2 className="text-3xl font-display font-bold text-mist-900 mb-4">Explore the Catalog</h2>
              {stats && (
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 rounded-full bg-mist-900/10 text-mist-900 text-sm">
                    {stats.totalBooks.toLocaleString()} books available
                  </span>
                </div>
              )}
            </div>
            <Link to="/search" className="text-brand-red font-semibold hover:text-mist-900 transition-colors flex items-center gap-2">
              View All Books <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {sampleBooks.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
