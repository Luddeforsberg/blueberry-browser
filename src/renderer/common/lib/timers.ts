import { useEffect, useRef, useState } from "react";

// Waiting and repeating in the renderers, written once, so every timer is cleared when its component goes.

// The time now, taken again every `every` ms while the component is there. A new `every` starts counting from then.
export const useNow = (every: number): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), every);
    return () => window.clearInterval(timer);
  }, [every]);
  return now;
};

// True for `ms` after `show` is called, such as "Copied" after a copy. Called again, it waits the whole time again.
export const useForAMoment = (ms: number): [boolean, () => void] => {
  const [shown, setShown] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const show = () => {
    setShown(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShown(false), ms);
  };
  return [shown, show];
};

// True once `ms` have passed since `start`, such as a preview after the pointer rests, until `stop`. Starting again while
// waiting waits the whole time again.
export const useAfterRest = (ms: number): [boolean, () => void, () => void] => {
  const [on, setOn] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const start = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOn(true), ms);
  };
  const stop = () => {
    window.clearTimeout(timer.current);
    setOn(false);
  };
  return [on, start, stop];
};
