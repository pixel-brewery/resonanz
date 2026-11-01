// #region Imports
import { Pipe, type PipeTransform } from '@angular/core';
// #endregion

/** Formats audio durations independently of calendar dates and time zones. */
@Pipe({ name: 'duration' })
export class DurationPipe implements PipeTransform {
  /** Compact media labels use mm:ss/h:mm:ss; the recording clock explicitly uses hh:mm:ss. */
  public transform(
    milliseconds: number | null | undefined,
    format: 'compact' | 'clock' = 'compact',
  ): string {
    const seconds = Math.floor(
      Math.max(0, Number.isFinite(milliseconds) ? (milliseconds ?? 0) : 0) / 1000,
    );
    const minutes = Math.floor(seconds / 60);
    const tail = String(seconds % 60).padStart(2, '0');
    if (format === 'clock')
      return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${tail}`;
    return minutes < 60
      ? `${String(minutes).padStart(2, '0')}:${tail}`
      : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${tail}`;
  }
}
