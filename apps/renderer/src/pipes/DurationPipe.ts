// #region Imports
import { Pipe, type PipeTransform } from '@angular/core';
// #endregion

/** Formats audio durations independently of calendar dates and time zones. */
@Pipe({ name: 'duration' })
export class DurationPipe implements PipeTransform {
  /** Formats elapsed milliseconds as mm:ss or h:mm:ss. */
  public transform(milliseconds: number | null | undefined): string {
    const seconds = Math.floor(
      Math.max(0, Number.isFinite(milliseconds) ? (milliseconds ?? 0) : 0) / 1000,
    );
    const minutes = Math.floor(seconds / 60);
    const tail = String(seconds % 60).padStart(2, '0');
    return minutes < 60
      ? `${String(minutes).padStart(2, '0')}:${tail}`
      : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${tail}`;
  }
}
