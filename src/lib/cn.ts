/**
 * Tiny class-name combiner. Imported as `cn` everywhere.
 */
import clsx, { type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
