import { useCallback, useEffect, useRef, useState } from "react";

/** Step state + "Play growth" timer, as in the prototype (1.3s per step). */
export function useReplay(max: number, opts: { loop?: boolean; autoplay?: boolean; interval?: number } = {}) {
  const [step, setStepState] = useState(max);
  const [fresh, setFresh] = useState<{ step: number | null; key: number }>({ step: null, key: 0 });
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef = useRef(step);
  const prevMax = useRef(max);

  const setStep = useCallback((s: number, animate = true) => {
    const prev = stepRef.current;
    stepRef.current = s;
    setStepState(s);
    setFresh((f) => ({ step: animate && s !== prev ? s : null, key: f.key + 1 }));
  }, []);

  const stop = useCallback(() => { if (timer.current) clearInterval(timer.current); timer.current = null; setPlaying(false); }, []);
  const play = useCallback(() => {
    if (timer.current) return stop();
    setStep(stepRef.current >= max ? 1 : stepRef.current + 1);
    setPlaying(true);
    timer.current = setInterval(() => {
      if (stepRef.current >= max) {
        if (opts.loop) { setStep(1); return; }
        stop(); return;
      }
      setStep(stepRef.current + 1);
    }, opts.interval ?? 1300);
  }, [max, opts.loop, opts.interval, setStep, stop]);

  useEffect(() => {
    // when the garden gains a new step, follow it
    if (max !== prevMax.current) { if (stepRef.current === prevMax.current) setStep(max, false); prevMax.current = max; }
  }, [max, setStep]);
  useEffect(() => {
    if (!opts.autoplay) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    setStep(1); play();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => stop, [stop]);

  return { step, setStep: (s: number) => { stop(); setStep(s); }, play, stop, playing, fresh };
}
