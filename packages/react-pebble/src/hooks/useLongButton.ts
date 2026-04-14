import { useEffect, useRef } from 'preact/hooks';
import {
  ButtonRegistry,
  type ButtonRegistryKey,
  type PebbleButton,
  type PebbleButtonHandler,
} from './internal/button-registry.js';

export function useLongButton(button: PebbleButton, handler: PebbleButtonHandler): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener: PebbleButtonHandler = () => handlerRef.current();
    const key: ButtonRegistryKey = `long_${button}`;
    ButtonRegistry.subscribe(key, listener);
    return () => ButtonRegistry.unsubscribe(key, listener);
  }, [button]);
}
