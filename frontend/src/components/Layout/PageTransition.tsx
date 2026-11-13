import { motion } from 'framer-motion';
import { ReactNode } from 'react';

/**
 * Wraps page content to apply consistent enter/exit animations.
 * 
 * Animation:
 * - Enter: Slide up slightly (20px) + Fade In
 * - Exit: Fade Out
 * - Duration: 0.7s (Slow and smooth)
 */
export function PageTransition({ children }: { children: ReactNode }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} // Custom easing for "smooth" feel
            className="w-full"
        >
            {children}
        </motion.div>
    );
}
