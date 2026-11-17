import type { Metadata } from "next";
import { GameForm } from "../game-form";

export const metadata: Metadata = { title: "Add a game" };

export default function NewGamePage() {
  return (
    <div>
      <h2 className="mb-4 text-2xl font-bold">➕ Add a game</h2>
      <GameForm />
    </div>
  );
}
