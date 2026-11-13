import React from 'react';
import { motion } from 'framer-motion';
import { themeColors } from '../../theme/colors.config';

const { brand, mist } = themeColors;

export function CosmicMagnifierIllustration() {
    return (
        <div className="relative w-full aspect-square flex items-center justify-center">
            {/* Background particles */}
            <motion.div
                className="absolute inset-0"
                animate={{ rotate: 360 }}
                transition={{ duration: 100, repeat: Infinity, ease: "linear" }}
            >
                {[...Array(20)].map((_, i) => (
                    <motion.circle
                        key={i}
                        cx={Math.random() * 400}
                        cy={Math.random() * 400}
                        r={Math.random() * 2 + 1}
                        fill={brand.coral}
                        opacity={Math.random()}
                        animate={{ opacity: [0.2, 0.8, 0.2], scale: [0.8, 1.2, 0.8] }}
                        transition={{ duration: Math.random() * 3 + 2, repeat: Infinity }}
                        style={{ position: 'absolute', left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
                        className="w-1 h-1 rounded-full bg-brand-coral"
                    />
                ))}
                {[...Array(20)].map((_, i) => (
                    <motion.circle
                        key={`c-${i}`}
                        cx={Math.random() * 400}
                        cy={Math.random() * 400}
                        r={Math.random() * 2 + 1}
                        fill={brand.red}
                        opacity={Math.random()}
                        animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.5, 0.8] }}
                        transition={{ duration: Math.random() * 4 + 2, repeat: Infinity, delay: Math.random() }}
                        style={{ position: 'absolute', left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
                        className="w-1 h-1 rounded-full bg-brand-red"
                    />
                ))}
            </motion.div>

            <svg width="100%" height="100%" viewBox="0 0 400 400" className="relative z-10 drop-shadow-[0_0_20px_rgba(206,69,50,0.3)]">
                {/* Glow behind glass */}
                <motion.circle
                    cx="180" cy="180" r="100"
                    fill="url(#glassGlow)"
                    animate={{ opacity: [0.5, 0.8, 0.5] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                />

                {/* Glass Edge */}
                <motion.circle
                    cx="180" cy="180" r="100"
                    fill="none"
                    stroke="url(#ringGradient)"
                    strokeWidth="8"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 2, ease: "easeInOut" }}
                />
                <motion.circle
                    cx="180" cy="180" r="95"
                    fill="none"
                    stroke={brand.red}
                    strokeWidth="2"
                    opacity="0.5"
                />

                {/* Handle */}
                <motion.path
                    d="M 250 250 L 330 330"
                    stroke="url(#handleGradient)"
                    strokeWidth="24"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.5, delay: 0.5, ease: "easeInOut" }}
                />
                <motion.path
                    d="M 250 250 L 330 330"
                    stroke={mist[50]}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray="4 12"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.5 }}
                    transition={{ duration: 1, delay: 2 }}
                />

                {/* Inner Tech Details */}
                <motion.path
                    d="M 120 180 L 240 180 M 180 120 L 180 240"
                    stroke={brand.red}
                    strokeWidth="1"
                    opacity="0.3"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 1, delay: 1 }}
                    style={{ originX: '180px', originY: '180px' }}
                />

                <motion.circle
                    cx="180" cy="180" r="60"
                    fill="none"
                    stroke={brand.coral}
                    strokeWidth="1"
                    strokeDasharray="4 8"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                    style={{ originX: '180px', originY: '180px' }}
                />

                <defs>
                    <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={brand.red} />
                        <stop offset="50%" stopColor={brand.coral} />
                        <stop offset="100%" stopColor={brand.red} />
                    </linearGradient>
                    <linearGradient id="handleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={brand.coral} />
                        <stop offset="100%" stopColor={mist[200]} />
                    </linearGradient>
                    <radialGradient id="glassGlow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor={brand.red} stopOpacity="0.15" />
                        <stop offset="80%" stopColor={brand.coral} stopOpacity="0.05" />
                        <stop offset="100%" stopColor={mist[50]} stopOpacity="0" />
                    </radialGradient>
                </defs>
            </svg>
        </div>
    );
}

export function MagicalBookIllustration() {
    return (
        <div className="relative w-full aspect-square flex items-center justify-center">
            {/* Floating particles */}
            {[...Array(15)].map((_, i) => (
                <motion.div
                    key={i}
                    className="absolute w-2 h-2 rounded bg-brand-red shadow-[0_0_10px_#ce4532]"
                    initial={{ opacity: 0, y: 0, x: 0 }}
                    animate={{
                        opacity: [0, 1, 0],
                        y: -100 - Math.random() * 100,
                        x: (Math.random() - 0.5) * 100
                    }}
                    transition={{
                        duration: 2 + Math.random() * 2,
                        repeat: Infinity,
                        delay: Math.random() * 2
                    }}
                    style={{ left: '50%', top: '40%' }}
                />
            ))}

            <svg width="100%" height="100%" viewBox="0 0 400 400" className="relative z-10 drop-shadow-[0_20px_30px_rgba(233,123,98,0.4)]">
                {/* Book shadow */}
                <ellipse cx="200" cy="320" rx="120" ry="30" fill={mist[300]} opacity="0.4" />

                {/* Pages (glowing) */}
                <motion.path
                    d="M 100 240 L 200 290 L 320 230 L 220 180 Z"
                    fill="url(#pageGradient)"
                    animate={{ y: [-5, 5, -5] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.path
                    d="M 100 240 L 100 260 L 200 310 L 200 290 Z"
                    fill={mist[100]}
                    opacity="0.8"
                    animate={{ y: [-5, 5, -5] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.path
                    d="M 200 310 L 320 250 L 320 230 L 200 290 Z"
                    fill={mist[200]}
                    opacity="0.6"
                    animate={{ y: [-5, 5, -5] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                />

                {/* Book Cover */}
                <motion.path
                    d="M 80 230 L 190 285 L 190 295 L 80 240 Z"
                    fill={brand.coral}
                    animate={{ y: [-5, 5, -5] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.path
                    d="M 190 285 L 330 215 L 330 225 L 190 295 Z"
                    fill={brand.red}
                    animate={{ y: [-5, 5, -5] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.path
                    d="M 80 230 L 220 160 L 330 215 L 190 285 Z"
                    fill="url(#coverGradient)"
                    animate={{ y: [-5, 5, -5] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                />

                {/* Cover Details */}
                <motion.path
                    d="M 120 220 L 160 200 L 190 240 L 240 205 L 280 225"
                    fill="none"
                    stroke={mist[50]}
                    strokeWidth="2"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1, y: [-5, 5, -5] }}
                    transition={{ pathLength: { duration: 3, ease: "easeInOut" }, y: { duration: 4, repeat: Infinity, ease: "easeInOut" } }}
                />
                <motion.circle cx="120" cy="220" r="4" fill={mist[50]} animate={{ y: [-5, 5, -5] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} />
                <motion.circle cx="160" cy="200" r="3" fill={mist[50]} animate={{ y: [-5, 5, -5] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} />
                <motion.circle cx="190" cy="240" r="5" fill={mist[50]} animate={{ y: [-5, 5, -5] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} />
                <motion.circle cx="240" cy="205" r="3" fill={mist[50]} animate={{ y: [-5, 5, -5] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} />
                <motion.circle cx="280" cy="225" r="4" fill={mist[50]} animate={{ y: [-5, 5, -5] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} />

                {/* Floating Holographic Ring */}
                <motion.ellipse
                    cx="200" cy="160" rx="80" ry="30"
                    fill="none"
                    stroke={brand.coral}
                    strokeWidth="2"
                    opacity="0.8"
                    animate={{
                        rotateX: [0, 20, 0],
                        rotateZ: [0, 360],
                        y: [-15, -5, -15]
                    }}
                    transition={{
                        rotateX: { duration: 5, repeat: Infinity, ease: "easeInOut" },
                        rotateZ: { duration: 20, repeat: Infinity, ease: "linear" },
                        y: { duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }
                    }}
                    style={{ originX: '200px', originY: '160px' }}
                />

                {/* Inner floating data gem */}
                <motion.path
                    d="M 200 120 L 220 150 L 200 180 L 180 150 Z"
                    fill={brand.red}
                    animate={{ y: [-20, -10, -20], rotateY: [0, 360] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    style={{ originX: '200px', originY: '150px' }}
                />

                <defs>
                    <linearGradient id="coverGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={brand.charcoal} />
                        <stop offset="50%" stopColor={brand.coral} />
                        <stop offset="100%" stopColor={brand.red} />
                    </linearGradient>
                    <linearGradient id="pageGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor={mist[100]} />
                        <stop offset="50%" stopColor={brand.red} stopOpacity="0.2" />
                        <stop offset="100%" stopColor={mist[200]} />
                    </linearGradient>
                </defs>
            </svg>
        </div>
    );
}

export function ScrollPromptIllustration() {
    return (
        <motion.svg
            width="40" height="60" viewBox="0 0 40 60"
            className="mt-6 drop-shadow-[0_0_15px_rgba(206,69,50,0.5)]"
        >
            <rect x="2" y="2" width="36" height="56" rx="18" fill="none" stroke={brand.red} strokeWidth="2" opacity="0.5" />
            <motion.circle
                cx="20" cy="15" r="4" fill={brand.coral}
                animate={{ y: [0, 25, 0], opacity: [1, 0, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.path
                d="M 12 40 L 20 48 L 28 40"
                fill="none" stroke={brand.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                animate={{ y: [0, 5, 0], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
        </motion.svg>
    );
}
