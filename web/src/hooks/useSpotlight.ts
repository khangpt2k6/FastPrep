import { useEffect } from 'react';

/**
 * One pointer listener for the whole page: the card under the pointer gets --mx and --my, which its
 * spotlight and hover border read. Cards opt in with the `spot` class. Off for touch and reduced motion.
 */
export function useSpotlight() {
  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!fine.matches || calm.matches) return;

    let frame = 0;
    let last: PointerEvent | null = null;

    const paint = () => {
      frame = 0;
      const event = last;
      if (!event) return;
      const target = event.target instanceof Element ? event.target : null;
      const card = target?.closest<HTMLElement>('.spot');
      if (!card) return;
      const box = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${Math.round(event.clientX - box.left)}px`);
      card.style.setProperty('--my', `${Math.round(event.clientY - box.top)}px`);
    };

    const onMove = (event: PointerEvent) => {
      last = event;
      if (!frame) frame = window.requestAnimationFrame(paint);
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);
}
