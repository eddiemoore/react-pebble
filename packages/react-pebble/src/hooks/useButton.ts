import { useEffect, useRef } from 'preact/hooks';
import {
  ButtonRegistry,
  type PebbleButton,
  type PebbleButtonHandler,
} from './internal/button-registry.js';

export function useButton(button: PebbleButton, handler: PebbleButtonHandler): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener: PebbleButtonHandler = () => handlerRef.current();
    ButtonRegistry.subscribe(button, listener);
    return () => {
      ButtonRegistry.unsubscribe(button, listener);
    };
  }, [button]);
}
