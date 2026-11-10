import type { Player, Position } from "./types";

type Row = [string, Position, number, number, number, number, number, number, number?];

// name, position, pace, stamina, shooting, passing, dribbling, defending, gk?
const ROWS: Row[] = [
  ["Aarav", "FWD", 84, 70, 82, 66, 80, 34],
  ["Kabir", "MID", 68, 82, 64, 80, 72, 62],
  ["Rohan", "DEF", 62, 76, 38, 60, 48, 81],
  ["Imran", "GK", 48, 60, 30, 58, 40, 52, 80],
  ["Dev", "FWD", 77, 62, 74, 58, 76, 30],
  ["Arjun", "MID", 72, 74, 70, 74, 75, 55],
  ["Nikhil", "DEF", 70, 80, 42, 64, 52, 74],
  ["Sahil", "MID", 60, 66, 55, 68, 60, 58],
  ["Vikram", "DEF", 55, 68, 35, 52, 40, 70],
  ["Zaid", "FWD", 88, 64, 70, 54, 82, 28],
  ["Pranav", "GK", 50, 58, 28, 62, 38, 48, 71],
  ["Tanmay", "MID", 64, 88, 58, 72, 62, 70],
  ["Harsh", "FWD", 66, 58, 66, 60, 64, 36],
  ["Ishaan", "DEF", 74, 72, 44, 66, 58, 78],
  ["Manav", "MID", 58, 60, 48, 62, 54, 50],
  ["Yash", "FWD", 80, 72, 85, 70, 78, 40],
  ["Farhan", "DEF", 60, 84, 40, 58, 44, 68],
  ["Kunal", "MID", 76, 78, 72, 84, 80, 60],
  ["Om", "DEF", 52, 62, 30, 48, 36, 62],
  ["Rehan", "FWD", 70, 54, 60, 50, 66, 26],
  ["Siddharth", "MID", 66, 70, 62, 70, 68, 64],
  ["Aditya", "DEF", 68, 74, 46, 62, 50, 76],
  ["Jay", "MID", 54, 56, 44, 58, 50, 46],
  ["Neel", "FWD", 74, 66, 68, 62, 72, 38],
];

export const SAMPLE_PLAYERS: Player[] = ROWS.map(
  ([name, pos, pace, stamina, shooting, passing, dribbling, defending, gk], i) => ({
    id: `sample-${i + 1}`,
    name,
    stats: { pace, stamina, shooting, passing, dribbling, defending },
    gk: gk ?? 35,
    primaryPos: pos,
    secondaryPos: null,
    foot: i % 5 === 0 ? "left" : "right",
    canGk: pos === "GK" || i === 8,
    playstyle: pos === "FWD" ? "attacking" : pos === "DEF" ? "defensive" : "balanced",
    sample: true,
  }),
);
