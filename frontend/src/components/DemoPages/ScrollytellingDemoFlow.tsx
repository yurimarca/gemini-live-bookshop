import React, { useRef, useEffect } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Search, BookOpen, ShoppingCart, LayoutGrid, UserPlus, CheckCircle, PenTool, Sparkles, MoveRight } from 'lucide-react';
import type { Book } from '../../types/book';
import { CosmicMagnifierIllustration, ScrollPromptIllustration } from './ScrollytellingIllustrations';

const DEMO_FLOW_STEPS = [
    { step: 1, label: 'Search for a book', icon: Search },
    { step: 2, label: 'View book details', icon: BookOpen },
    { step: 3, label: 'Add to cart', icon: ShoppingCart },
    { step: 4, label: 'Browse or view cart', icon: LayoutGrid },
    { step: 5, label: 'Register an account', icon: UserPlus },
    { step: 6, label: 'Complete purchase', icon: CheckCircle },
] as const;

export function ScrollytellingDemoFlow({ highlightedDemoStep, sampleBooks }: { highlightedDemoStep: number | null, sampleBooks: Book[] }) {
    const containerRef = useRef<HTMLDivElement>(null);

    const { scrollYProgress } = useScroll({
        target: containerRef,
        offset: ["start start", "end end"]
    });

    // Derived progress values for each step's specific active region
    // Progress 0.0 to 0.1: Initial State
    // 0.1 to 0.25: Step 1
    // 0.25 to 0.4: Step 2
    // 0.4 to 0.55: Step 3
    // 0.55 to 0.7: Step 4
    // 0.7 to 0.85: Step 5
    // 0.85 to 1.0: Step 6

    const step1Active = useTransform(scrollYProgress, [0.05, 0.15, 0.25, 0.28], [0, 1, 1, 0]);
    const step2Active = useTransform(scrollYProgress, [0.22, 0.3, 0.4, 0.43], [0, 1, 1, 0]);
    const step3Active = useTransform(scrollYProgress, [0.38, 0.45, 0.55, 0.58], [0, 1, 1, 0]);
    const step4Active = useTransform(scrollYProgress, [0.52, 0.6, 0.7, 0.73], [0, 1, 1, 0]);
    const step5Active = useTransform(scrollYProgress, [0.68, 0.75, 0.85, 0.88], [0, 1, 1, 0]);
    const step6Active = useTransform(scrollYProgress, [0.82, 0.9, 1, 1], [0, 1, 1, 1]);

    // Current active index based on scroll
    const [activeIndex, setActiveIndex] = React.useState(0);

    useEffect(() => {
        return scrollYProgress.onChange((v) => {
            if (v < 0.1) setActiveIndex(0);
            else if (v < 0.25) setActiveIndex(1);
            else if (v < 0.4) setActiveIndex(2);
            else if (v < 0.55) setActiveIndex(3);
            else if (v < 0.7) setActiveIndex(4);
            else if (v < 0.85) setActiveIndex(5);
            else setActiveIndex(6);
        });
    }, [scrollYProgress]);

    // Determine which step is highlighted, either from scroll or from external voice agent event
    const currentStep = highlightedDemoStep || activeIndex;

    // Background and global styling
    const bgOpacity = useTransform(scrollYProgress, [0, 0.1], [0.3, 0.8]);
    const bgColor = useTransform(
        scrollYProgress,
        [0, 0.5, 1],
        ['rgba(254,254,254,1)', 'rgba(245,240,239,1)', 'rgba(230,223,223,1)']
    );

    return (
        <div ref={containerRef} className="relative w-full h-[700vh] bg-mist-50">
            <div className="sticky top-0 h-screen w-full overflow-hidden flex items-center justify-center">

                {/* Illustrative Background Texture */}
                <motion.div
                    className="absolute inset-0 pointer-events-none opacity-40 mix-blend-multiply"
                    style={{
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.5'/%3E%3C/svg%3E")`,
                        backgroundColor: bgColor,
                        opacity: bgOpacity
                    }}
                />

                <div className="max-w-7xl mx-auto px-4 w-full h-full flex flex-row items-center relative z-10 py-20">

                    {/* Left Sidebar - The static list visually transitioning */}
                    <div className="w-1/3 flex flex-col justify-center gap-6 pr-8 border-r border-mist-900/10 relative h-full pt-10">
                        <h2 className="text-2xl font-display font-bold text-mist-900/50 mb-4 px-2">Demo Flow</h2>
                        <div className="absolute left-[38px] top-[140px] bottom-20 w-px bg-gradient-to-b from-mist-900/20 via-mist-900/10 to-transparent" />

                        {DEMO_FLOW_STEPS.map(({ step, label, icon: Icon }) => {
                            const isActive = currentStep === step;
                            return (
                                <motion.div
                                    key={step}
                                    animate={{
                                        scale: isActive ? 1.05 : 1,
                                        opacity: isActive ? 1 : 0.5,
                                        x: isActive ? 10 : 0
                                    }}
                                    className="relative flex gap-5 items-center z-10"
                                >
                                    <div
                                        className={`flex-shrink-0 w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-500 ${isActive
                                            ? 'border-brand-red bg-brand-red/20 text-brand-red shadow-[0_0_15px_rgba(206,69,50,0.4)]'
                                            : 'border-mist-900/20 bg-mist-100 text-mist-600'
                                            }`}
                                    >
                                        <Icon className="w-5 h-5" />
                                    </div>
                                    <div
                                        className={`flex-1 rounded-xl border px-5 py-4 transition-all duration-500 backdrop-blur-sm ${isActive
                                            ? 'bg-brand-red/10 border-brand-red/40 shadow-lg shadow-brand-red/10'
                                            : 'bg-mist-900/5 border-mist-900/10'
                                            }`}
                                    >
                                        <span className="text-xs font-semibold text-brand-red/80 uppercase tracking-wider block mb-1">
                                            Step {step}
                                        </span>
                                        <p className={`font-medium ${isActive ? 'text-brand-red' : 'text-mist-900'}`}>
                                            {label}
                                        </p>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* Right Area - The Illustrative Scrollytelling Canvas */}
                    <div className="w-2/3 h-full relative flex items-center justify-center pl-12 perspective-[1000px]">

                        {/* Initial State Prompt */}
                        <motion.div
                            style={{
                                opacity: useTransform(scrollYProgress, [0, 0.05, 0.1], [1, 1, 0]),
                                scale: useTransform(scrollYProgress, [0, 0.1], [1, 0.8])
                            }}
                            className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none"
                        >
                            <div className="w-24 h-24 rounded-full bg-brand-coral/20 flex items-center justify-center mb-6 animate-pulse shadow-[0_0_50px_rgba(233,123,98,0.3)]">
                                <Sparkles className="w-12 h-12 text-brand-coral" />
                            </div>
                            <h3 className="text-4xl font-display font-light text-mist-900 italic tracking-wide">
                                "How should we proceed?"
                            </h3>
                            <ScrollPromptIllustration />
                        </motion.div>

                        {/* SCENE 1: Search for a book */}
                        <motion.div
                            className="absolute inset-0 flex items-center justify-center w-full h-full"
                            style={{
                                opacity: step1Active,
                                scale: useTransform(scrollYProgress, [0.05, 0.15, 0.25], [0.8, 1, 1.2]),
                                pointerEvents: activeIndex === 1 ? 'auto' : 'none',
                            }}
                        >
                            <div className="relative w-full h-full flex flex-col items-center justify-center">
                                <motion.div
                                    initial={{ y: -50, scale: 0.8 }}
                                    whileInView={{ y: 0, scale: 1 }}
                                    transition={{ type: 'spring', bounce: 0.5, duration: 1.5 }}
                                    className="absolute z-0 w-full max-w-[800px] opacity-60"
                                >
                                    <CosmicMagnifierIllustration />
                                </motion.div>

                                <div className="grid grid-cols-2 gap-6 z-10 w-full max-w-lg mt-12 bg-mist-100/40 p-8 rounded-3xl border border-mist-900/10 backdrop-blur-md shadow-2xl">
                                    {(sampleBooks.length > 0 ? sampleBooks.slice(0, 4) : [{ title: 'Dune' } as Partial<Book>, { title: 'Foundation' } as Partial<Book>, { title: 'Neuromancer' } as Partial<Book>, { title: 'Snow Crash' } as Partial<Book>]).map((book, i) => (
                                        <motion.div
                                            key={book.title}
                                            initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
                                            whileInView={{ opacity: 1, x: 0 }}
                                            transition={{ delay: i * 0.1 }}
                                            className="bg-mist-900/5 border border-mist-900/10 p-4 rounded-xl flex items-center gap-4"
                                        >
                                            {book.imageUrl ? (
                                                <img src={book.imageUrl} alt={book.title} className="w-10 h-14 rounded shadow-inner object-cover" />
                                            ) : (
                                                <div className="w-10 h-14 bg-gradient-to-br from-brand-coral to-brand-red rounded shadow-inner flex-shrink-0" />
                                            )}
                                            <span className="text-mist-900 font-medium text-sm line-clamp-2">{book.title}</span>
                                        </motion.div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>

                        {/* SCENE 2: View book details */}
                        <motion.div
                            className="absolute inset-0 flex items-center justify-center w-full h-full"
                            style={{
                                opacity: step2Active,
                                rotateY: useTransform(scrollYProgress, [0.22, 0.3], [90, 0]),
                                z: useTransform(scrollYProgress, [0.22, 0.3], [-500, 0]),
                                pointerEvents: activeIndex === 2 ? 'auto' : 'none',
                            }}
                        >
                            <div className="relative w-full max-w-xl bg-gradient-to-br from-mist-100 to-mist-50 border border-mist-900/20 p-8 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.12)] flex flex-row gap-8 items-center transform-gpu preserve-3d">
                                <motion.div
                                    className="w-48 h-72 bg-gradient-to-br from-brand-coral via-mist-200 to-brand-red rounded-lg shadow-[20px_20px_60px_rgba(0,0,0,0.15),-10px_-10px_30px_rgba(255,255,255,0.4)] border border-mist-900/10 overflow-hidden"
                                    animate={{ rotateY: [-20, 0, 10], rotateX: [10, 0, 5] }}
                                    transition={{ duration: 4, repeat: Infinity, repeatType: 'reverse' }}
                                >
                                    {sampleBooks.length > 0 && sampleBooks[0].imageUrl && (
                                        <img src={sampleBooks[0].imageUrl} alt="Featured Book" className="w-full h-full object-cover" />
                                    )}
                                </motion.div>
                                <div className="flex-1 space-y-4">
                                    {sampleBooks.length > 0 ? (
                                        <>
                                            <h3 className="text-2xl font-bold text-mist-900 line-clamp-2 leading-tight">{sampleBooks[0].title}</h3>
                                            <p className="text-mist-700 text-sm">{sampleBooks[0].productInformation?.Author || 'Unknown Author'}</p>
                                            <div className="pt-4 space-y-2 max-h-32 overflow-hidden relative">
                                                <p className="text-mist-700 text-sm leading-relaxed">{sampleBooks[0].description}</p>
                                                <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-mist-50 to-transparent"></div>
                                            </div>
                                            <div className="pt-4">
                                                <span className="text-3xl font-bold text-brand-red">${sampleBooks[0].price.toFixed(2)}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="h-8 w-3/4 bg-mist-900/10 rounded animate-pulse" />
                                            <div className="h-4 w-1/2 bg-mist-900/5 rounded" />
                                            <div className="pt-4 space-y-2">
                                                <div className="h-2 w-full bg-mist-900/5 rounded" />
                                                <div className="h-2 w-full bg-mist-900/5 rounded" />
                                                <div className="h-2 w-5/6 bg-mist-900/5 rounded" />
                                                <div className="h-2 w-4/6 bg-mist-900/5 rounded" />
                                            </div>
                                            <div className="pt-6">
                                                <span className="text-2xl font-bold text-brand-red">$14.99</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </motion.div>

                        {/* SCENE 3: Add to cart */}
                        <motion.div
                            className="absolute inset-0 flex items-center justify-center w-full h-full"
                            style={{
                                opacity: step3Active,
                                y: useTransform(scrollYProgress, [0.38, 0.45], [100, 0]),
                                pointerEvents: activeIndex === 3 ? 'auto' : 'none',
                            }}
                        >
                            <div className="flex items-center gap-12">
                                <button className="relative overflow-hidden bg-brand-coral text-primary-foreground px-8 py-4 rounded-xl font-bold shadow-[0_0_30px_rgba(233,123,98,0.4)] group">
                                    <span className="relative z-10">Add to Cart</span>
                                    <motion.div
                                        className="absolute inset-0 bg-primary-foreground/20"
                                        initial={{ x: '-100%' }}
                                        whileInView={{ x: '100%' }}
                                        transition={{ duration: 1, repeat: Infinity, repeatDelay: 1 }}
                                    />
                                </button>

                                <motion.div
                                    initial={{ width: 0, opacity: 0 }}
                                    whileInView={{ width: 150, opacity: 1 }}
                                    className="h-1 bg-gradient-to-r from-brand-coral to-brand-red relative"
                                >
                                    <MoveRight className="absolute -right-6 -top-3 text-brand-red w-8 h-8" />
                                </motion.div>

                                <div className="relative">
                                    <ShoppingCart className="w-20 h-20 text-mist-900/50" strokeWidth={1} />
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        whileInView={{ scale: 1 }}
                                        transition={{ type: "spring", delay: 0.5 }}
                                        className="absolute -top-2 -right-2 w-8 h-8 bg-brand-red rounded-full flex items-center justify-center text-primary-foreground font-bold"
                                    >
                                        1
                                    </motion.div>
                                </div>
                            </div>
                        </motion.div>

                        {/* SCENE 4: Browse or view cart */}
                        <motion.div
                            className="absolute inset-0 flex items-center justify-center w-full h-full"
                            style={{
                                opacity: step4Active,
                                scale: useTransform(scrollYProgress, [0.52, 0.6], [0.5, 1]),
                                pointerEvents: activeIndex === 4 ? 'auto' : 'none',
                            }}
                        >
                            <div className="w-full max-w-2xl bg-mist-100/80 backdrop-blur-xl border border-mist-900/10 rounded-3xl p-8 shadow-2xl">
                                <div className="flex items-center gap-4 mb-8 border-b border-mist-900/10 pb-4">
                                    <ShoppingCart className="w-8 h-8 text-brand-red" />
                                    <h2 className="text-2xl font-bold text-mist-900">Your Cart</h2>
                                </div>

                                <div className="space-y-4">
                                    {(sampleBooks.length > 1 ? sampleBooks.slice(0, 2) : [1, 2]).map((item: any, i) => (
                                        <div key={i} className="flex items-center gap-6 bg-mist-900/5 p-4 rounded-xl border border-mist-900/5">
                                            {item.imageUrl ? (
                                                <img src={item.imageUrl} alt={item.title} className="w-16 h-24 rounded shadow-md object-cover" />
                                            ) : (
                                                <div className="w-16 h-24 bg-gradient-to-br from-brand-coral/50 to-brand-red/50 rounded shadow-md flex-shrink-0" />
                                            )}
                                            <div className="flex-1 space-y-2">
                                                {item.title ? (
                                                    <div className="text-mist-900 font-medium line-clamp-1">{item.title}</div>
                                                ) : (
                                                    <div className="h-4 w-1/3 bg-mist-900/20 rounded" />
                                                )}
                                                {item.productInformation?.Author ? (
                                                    <div className="text-mist-700 text-xs">{item.productInformation.Author}</div>
                                                ) : (
                                                    <div className="h-3 w-1/4 bg-mist-900/10 rounded" />
                                                )}
                                            </div>
                                            <div className="text-xl font-bold text-mist-900">
                                                ${item.price ? item.price.toFixed(2) : "24.99"}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-8 flex justify-between items-center pt-6 border-t border-mist-900/10">
                                    <span className="text-mist-700">Total:</span>
                                    <span className="text-3xl font-bold text-brand-coral">
                                        ${sampleBooks.length > 1 ? (sampleBooks[0].price + sampleBooks[1].price).toFixed(2) : "49.98"}
                                    </span>
                                </div>
                            </div>
                        </motion.div>

                        {/* SCENE 5: Register an account */}
                        <motion.div
                            className="absolute inset-0 flex flex-col items-center justify-center w-full h-full"
                            style={{
                                opacity: step5Active,
                                y: useTransform(scrollYProgress, [0.68, 0.75], [50, 0]),
                                pointerEvents: activeIndex === 5 ? 'auto' : 'none',
                            }}
                        >
                            <div className="relative w-full max-w-md bg-mist-900/5 border border-mist-900/20 backdrop-blur-md rounded-2xl p-8 shadow-2xl overflow-hidden">
                                <motion.div
                                    animate={{ x: [0, 50, -20, 100, 0], y: [0, -20, 30, -10, 0] }}
                                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                    className="absolute -top-12 -right-12 text-brand-red pointer-events-none opacity-50 z-20"
                                >
                                    <PenTool size={100} strokeWidth={1} />
                                </motion.div>

                                <div className="text-center mb-8">
                                    <UserPlus className="w-12 h-12 text-brand-red mx-auto mb-4" />
                                    <h2 className="text-2xl font-bold text-mist-900">Create Account</h2>
                                </div>

                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <div className="h-3 w-16 bg-mist-900/20 rounded" />
                                        <div className="h-12 w-full bg-mist-50/50 border border-mist-900/10 rounded-lg relative overflow-hidden flex items-center px-4">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                whileInView={{ width: '60%' }}
                                                transition={{ duration: 1.5, ease: "linear" }}
                                                className="h-2 bg-mist-900/30 rounded-full"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="h-3 w-12 bg-mist-900/20 rounded" />
                                        <div className="h-12 w-full bg-mist-50/50 border border-mist-900/10 rounded-lg relative overflow-hidden flex items-center px-4">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                whileInView={{ width: '80%' }}
                                                transition={{ delay: 1, duration: 1.5, ease: "linear" }}
                                                className="h-2 bg-mist-900/30 rounded-full"
                                            />
                                        </div>
                                    </div>

                                    <button className="w-full bg-mist-900/10 text-mist-900 font-bold py-3 rounded-lg border border-mist-900/20 mt-4">
                                        Registering...
                                    </button>
                                </div>
                            </div>
                        </motion.div>

                        {/* SCENE 6: Complete purchase */}
                        <motion.div
                            className="absolute inset-0 flex items-center justify-center w-full h-full"
                            style={{
                                opacity: step6Active,
                                scale: useTransform(scrollYProgress, [0.82, 0.9], [0.8, 1]),
                                pointerEvents: activeIndex === 6 ? 'auto' : 'none',
                            }}
                        >
                            <div className="relative text-center w-full max-w-lg">
                                <div className="absolute inset-0 bg-gradient-to-t from-brand-red/20 to-transparent blur-[100px] z-0" />

                                <motion.div
                                    initial={{ scale: 0, rotate: -180 }}
                                    whileInView={{ scale: 1, rotate: 0 }}
                                    transition={{ type: "spring", damping: 12 }}
                                    className="w-32 h-32 bg-gradient-to-br from-brand-red to-brand-coral rounded-full flex items-center justify-center mx-auto mb-8 shadow-[0_0_80px_rgba(206,69,50,0.3)] relative z-10"
                                >
                                    <CheckCircle className="w-16 h-16 text-primary-foreground" />
                                </motion.div>

                                <h2 className="text-4xl font-display font-bold text-mist-900 mb-4 relative z-10">Purchase Complete!</h2>

                                <div className="bg-mist-900/5 border border-mist-900/10 rounded-2xl p-6 backdrop-blur-md relative z-10 inline-block w-full max-w-sm text-left mx-auto">
                                    <div className="border-b border-mist-900/10 pb-4 mb-4 border-dashed">
                                        <span className="text-mist-700 text-sm uppercase tracking-wider block mb-1">Receipt Number</span>
                                        <span className="text-brand-red font-mono text-lg">#ORD-8942-TX</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm mb-2 text-mist-700">
                                        <span>Subtotal</span>
                                        <span>${sampleBooks.length > 1 ? (sampleBooks[0].price + sampleBooks[1].price).toFixed(2) : "49.98"}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm mb-4 text-mist-700">
                                        <span>Tax</span>
                                        <span>${sampleBooks.length > 1 ? ((sampleBooks[0].price + sampleBooks[1].price) * 0.08).toFixed(2) : "4.00"}</span>
                                    </div>
                                    <div className="flex justify-between items-center font-bold text-lg text-mist-900 border-t border-mist-900/10 border-dashed pt-4">
                                        <span>Total Paid</span>
                                        <span className="text-brand-coral">${sampleBooks.length > 1 ? ((sampleBooks[0].price + sampleBooks[1].price) * 1.08).toFixed(2) : "53.98"}</span>
                                    </div>
                                </div>

                                {/* Confetti (approximate with floating elements) */}
                                <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                                    {[...Array(20)].map((_, i) => (
                                        <motion.div
                                            key={i}
                                            animate={{
                                                y: [-20, -1000],
                                                x: [0, (Math.random() - 0.5) * 500],
                                                rotate: [0, 360],
                                                opacity: [1, 0]
                                            }}
                                            transition={{
                                                duration: 3 + Math.random() * 2,
                                                repeat: Infinity,
                                                delay: Math.random() * 2,
                                                ease: "linear"
                                            }}
                                            className={`absolute bottom-0 w-3 h-3 rounded-full ${i % 3 === 0 ? 'bg-brand-red' : i % 3 === 1 ? 'bg-brand-coral' : 'bg-mist-900'
                                                }`}
                                            style={{
                                                left: `${Math.random() * 100}%`
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        </motion.div>

                    </div>
                </div>
            </div>
        </div>
    );
}
