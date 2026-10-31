import { describe, expect, it } from 'vitest';
import { MicrophoneVoiceGate } from './MicrophoneVoiceGate';

describe('MicrophoneVoiceGate', () => {
  it('requires sustained microphone energy after the initial suppression window', () => {
    const gate = new MicrophoneVoiceGate();
    expect(gate.observe(0.1, 100, true, 200)).toBe(false);
    expect(gate.observe(0.1, 100, true, 300)).toBe(false);
    expect(gate.observe(0.1, 100, true, 400)).toBe(true);
    expect(gate.observe(0.1, 100, true, 500)).toBe(false);
    gate.reset();
    expect(gate.observe(0.1, 100, true, 600)).toBe(false);
  });

  it('does not accumulate separated clicks or interrupt while recognition is already active', () => {
    const gate = new MicrophoneVoiceGate();
    for (let i = 0; i < 10; i++) {
      expect(gate.observe(0.2, 20, true, 500)).toBe(false);
      expect(gate.observe(0, 100, true, 600)).toBe(false);
    }
    expect(gate.observe(0.2, 100, false, 700)).toBe(false);
    expect(gate.observe(0.2, 100, true, 800)).toBe(false);
  });
});
