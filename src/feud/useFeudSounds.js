import { useEffect, useRef, useState } from "react";
import { currentBoard } from "./game.js";

function playSound(context, sound) {
  const start = context.currentTime;
  const duration = sound === "ding" ? 0.65 : 0.35;
  const oscillator = context.createOscillator();
  const volume = context.createGain();
  oscillator.type = sound === "ding" ? "sine" : "sawtooth";
  oscillator.frequency.setValueAtTime(sound === "ding" ? 1174.66 : 150, start);
  if (sound === "buzz")
    oscillator.frequency.exponentialRampToValueAtTime(90, start + duration);
  volume.gain.setValueAtTime(0, start);
  volume.gain.linearRampToValueAtTime(sound === "ding" ? 0.3 : 0.12, start + 0.01);
  volume.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(volume);
  volume.connect(context.destination);
  oscillator.onended = () => {
    oscillator.disconnect();
    volume.disconnect();
  };
  oscillator.start(start);
  oscillator.stop(start + duration);
}

export default function useFeudSounds(game, roomCode) {
  const audio = useRef(null);
  const previous = useRef(null);
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(true);

  // Browsers require a local gesture, including on a read-only TV display.
  useEffect(() => {
    function unlock(event) {
      if (event.target.closest?.("[data-feud-sound-toggle]")) return;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      try {
        audio.current ??= new AudioContext();
        const context = audio.current;
        context.resume()
          .then(() => {
            if (audio.current === context) setReady(context.state === "running");
          })
          .catch(() => {});
      } catch {
        // Audio availability must never interrupt hosting or joining a game.
      }
    }
    document.addEventListener("click", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("click", unlock);
      document.removeEventListener("keydown", unlock);
      const context = audio.current;
      audio.current = null;
      context?.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const last = previous.current;
    previous.current = { game, roomCode };
    if (
      !game ||
      !last?.game ||
      last.roomCode !== roomCode ||
      game.questionIndex !== last.game.questionIndex ||
      game.finished ||
      last.game.finished
    )
      return;
    const before = currentBoard(last.game);
    const after = currentBoard(game);
    if (before.awardedTo !== null || after.awardedTo !== null) return;
    const sound =
      after.strikes > before.strikes
        ? "buzz"
        : after.revealed.some((index) => !before.revealed.includes(index))
          ? "ding"
          : null;
    // Always consume updates while muted/locked so enabling sound cannot replay
    // old answers, initial snapshots, or optimistic taps that later fail.
    if (sound && enabled && audio.current?.state === "running") {
      try {
        playSound(audio.current, sound);
      } catch {
        // A lost audio device must not interrupt the game.
      }
    }
  }, [game, roomCode, enabled]);

  async function toggleSound() {
    if (ready) {
      setEnabled((value) => !value);
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      setReady(audio.current.state === "running");
      setEnabled(true);
    } catch {
      // Let the user retry after a browser or device audio restriction.
    }
  }

  return {
    soundLabel: !ready ? "Enable sound" : enabled ? "Sound on" : "Sound off",
    toggleSound,
  };
}
