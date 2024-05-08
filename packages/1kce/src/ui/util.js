/* global document requestAnimationFrame cancelAnimationFrame */
import React from 'react';

// helper for react elements
export const h = React.createElement;

// helper for react keys
const randomString = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
const keyMap = new WeakMap()
const keyForItem = (item) => {
  if (!keyMap.has(item)) {
    keyMap.set(item, randomString())
  }
  return keyMap.get(item)
}
export const keyForItems = (...items) => {
  return items.map((item) => typeof item === 'string' ? item : keyForItem(item)).join('-')
}

// helper for async react components
export const useAsync = (asyncFn, deps) => {
  const [state, setState] = React.useState({
    loading: true,
    error: null,
    value: null,
  });
  React.useEffect(() => {
    let didAbort = false
    setState({
      loading: true,
      error: null,
      value: null,
    });
    asyncFn()
      .then(value => {
        if (didAbort) {
          return;
        }
        setState({
          loading: false,
          error: null,
          value,
        });
      })
      .catch(error => {
        if (didAbort) {
          return;
        }
        setState({
          loading: false,
          error,
          value: null,
        });
      });
    return () => {
      didAbort = true;
    }
  }, deps);
  return state;
}

// helper for react canvas
export const useRaf = (
  callback,
  isActive,
  deps = [],
) => {
  const savedCallback = React.useRef();
  // Remember the latest function.
  React.useEffect(() => {
    savedCallback.current = callback;
  }, deps);

  React.useEffect(() => {
    let animationFrame;
    let startTime = Date.now();

    function tick() {
      const timeElapsed = Date.now() - startTime;
      startTime = Date.now();
      loop();
      savedCallback.current?.(timeElapsed);
    }

    function loop() {
      animationFrame = requestAnimationFrame(tick);
    }

    if (isActive) {
      startTime = Date.now();
      loop();

      return () => {
        if (animationFrame) {
          cancelAnimationFrame(animationFrame);
        }
      };
    }
  }, [isActive]);
}

function getMousePositionFromEvent(event) {
  const {
    screenX,
    screenY,
    movementX,
    movementY,
    pageX,
    pageY,
    clientX,
    clientY,
    offsetX,
    offsetY,
  } = event;

  return {
    clientX,
    clientY,
    movementX,
    movementY,
    offsetX,
    offsetY,
    pageX,
    pageY,
    screenX,
    screenY,
    x: screenX,
    y: screenY,
  };
}

/**
 * useMouse hook
 *
 * Retrieves current mouse position and information about the position like
 * screenX, pageX, clientX, movementX, offsetX
 * @see https://rooks.vercel.app/docs/useMouse
 */
export function useMouse() {
  const [mousePosition, setMousePosition] =
    React.useState({});

  function updateMousePosition(event) {
    setMousePosition(getMousePositionFromEvent(event));
  }

  React.useEffect(() => {
    document.addEventListener('mousemove', updateMousePosition);

    return () => {
      document.removeEventListener('mousemove', updateMousePosition);
    };
  }, []);

  return mousePosition;
}

// helper for using grains in react
export const useGrain = (grain) => {
  const [grainValue, setGrainValue] = React.useState(grain.get());
  React.useEffect(() => {
    const unsubscribe = grain.subscribe(value => {
      setGrainValue(value)
    })
    return () => {
      unsubscribe();
    }
  }, [grain])
  return grainValue;
}
export const useGrainGetter = (grainGetter, deps) => {
  const grain = React.useMemo(grainGetter, deps)
  return useGrain(grain)
}
