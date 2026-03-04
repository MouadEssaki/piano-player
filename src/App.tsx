import { useEffect, useRef, useState } from "react";
import abcjs from "abcjs";
import "abcjs/abcjs-audio.css";

// Define the shape of the ABCJS event data
interface MidiPitch {
  pitch: number;
}

interface AbcElem extends Element {
  classList: DOMTokenList;
  style: CSSStyleDeclaration;
}

interface AbcEvent {
  measureStart?: boolean;
  left?: number | null;
  top?: number;
  height?: number;
  elements?: AbcElem[][]; // Nested array of elements (voices -> elements)
  midiPitches?: MidiPitch[];
}

export default function App() {
  const [abcText, setAbcText] = useState(
    `X:1
T:Transcription de Partition
M:4/4
L:1/8
Q:1/4=80
K:Ab
%%staves {1 2}
V:1 piano
V:2 piano bass
% --- Mesure 1 ---
[V:1] ([c3/e3/][B/d/]) ([c2e2] [A2c2]) ([c2e2] |[V:2] A,, (E, A, C) E, (A, C E) |
% --- Mesure 2 ---
[V:1] [c4e4]) ([B2d2][A2c2]) |
[V:2] A,, (E, A, C) E, (A, C E) |
% --- Mesure 3 ---
[V:1] ([c3/e3/] [B/d/]) ([c2e2] [A2c2]) ([c2e2] |
[V:2] A,, (E, A, C) E, (A, C E) |
% --- Mesure 4 ---
[V:1][c4e4]) ([A2c2] [B2d2]) |
[V:2] A,, (E, A, C) E, (A, C E) |
% --- Mesure 5 ---[V:1] [c4e4] ([B2d2] [A2c2]) |[V:2] A,, (E, A, C) E, (A, C E) |]`
  );

  // Explicitly type the state as an array of strings
  const [currentDroite, setCurrentDroite] = useState<string[]>([]);
  const [currentGauche, setCurrentGauche] = useState<string[]>([]);

  // Explicitly type the Refs as HTMLDivElement
  const notationRef = useRef<HTMLDivElement>(null);
  const synthControlRef = useRef<HTMLDivElement>(null);

  // Type the pitch parameter
  const getSolfege = (pitch: number) => {
    // Mapping simple. Note: Dans une vraie app musicale, on gérerait les bémols selon la tonalité.
    const notes = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];
    return notes[pitch % 12];
  };

  // Styles Tailwind
  const NOTE_DROITE = ["!fill-blue-500", "!stroke-blue-500", "transition-colors", "duration-75"];
  const NOTE_GAUCHE = ["!fill-purple-500", "!stroke-purple-500", "transition-colors", "duration-75"];

  useEffect(() => {
    if (!notationRef.current || !synthControlRef.current) return;

    notationRef.current.innerHTML = "";
    synthControlRef.current.innerHTML = "";

    const visualObj = abcjs.renderAbc(notationRef.current, abcText, {
      add_classes: true,
      responsive: "resize",
    })[0];

    const cursorControl = {
      onStart: () => {
        setCurrentDroite([]);
        setCurrentGauche([]);
        // Use optional chaining for safe access inside callbacks
        const svg = notationRef.current?.querySelector("svg");
        if (!svg) return;

        let cursor = svg.querySelector(".abcjs-cursor") as SVGLineElement | null;
        if (!cursor) {
          cursor = document.createElementNS("http://www.w3.org/2000/svg", "line");
          cursor.setAttribute("class", "abcjs-cursor !stroke-blue-400 !stroke-[3px] !opacity-70");
          svg.appendChild(cursor);
        }
        cursor.style.display = "block";
      },

      onFinished: () => {
        setCurrentDroite([]);
        setCurrentGauche([]);
        document.querySelectorAll(".playing-note").forEach((el) => {
          el.classList.remove("playing-note", ...NOTE_DROITE, ...NOTE_GAUCHE);
        });
        const cursor = notationRef.current?.querySelector(".abcjs-cursor") as SVGElement | null;
        if (cursor) cursor.style.display = "none";
      },

      onEvent: (event: AbcEvent) => {
        if (!event) return;
        // Ignore les événements de structure (barres de mesure sans notes)
        if (event.measureStart && event.left === null) return;

        // 1. ANALYSE VISUELLE : Qui joue quoi ?
        let countNotesGauche = 0;
        // On nettoie les styles précédents
        document.querySelectorAll(".playing-note").forEach((el) => {
          el.classList.remove("playing-note", ...NOTE_DROITE, ...NOTE_GAUCHE);
        });

        if (event.elements) {
          event.elements.forEach((group) => {
            // "group" contient les éléments SVG d'une note (tête, hampe...)
            // On regarde la classe du premier élément pour savoir à quelle voix il appartient
            let isGauche = false;

            group.forEach((el) => {
              el.classList.add("playing-note");

              // abcjs-v1 correspond à la 2ème voix (Main Gauche ici)
              if (el.classList.contains("abcjs-v1")) {
                el.classList.add(...NOTE_GAUCHE);
                isGauche = true;
              } else {
                // Par défaut ou abcjs-v0 -> Main Droite
                el.classList.add(...NOTE_DROITE);
              }
            });

            // Si ce groupe appartenait à la voix 1 (gauche), on incrémente le compteur
            if (isGauche) countNotesGauche++;
          });
        }

        // 2. DISTRIBUTION DES NOTES AUDIO (Midi Pitch)
        if (event.midiPitches && event.midiPitches.length > 0) {
          // On récupère tous les pitchs et on les trie du plus grave au plus aigu
          const pitches = event.midiPitches.map(p => p.pitch).sort((a, b) => a - b);

          // On convertit en texte (Solfege)
          const allNotesText = pitches.map(getSolfege);

          // Les X notes les plus graves vont à la main gauche (selon le compte visuel)
          const notesGauche = allNotesText.slice(0, countNotesGauche);
          // Le reste va à la main droite
          const notesDroite = allNotesText.slice(countNotesGauche);

          // On met à jour l'affichage en retirant les doublons (Set) pour éviter "Do Do" si octave
          setCurrentGauche([...new Set(notesGauche)]);
          setCurrentDroite([...new Set(notesDroite)]);
        } else {
          setCurrentDroite([]);
          setCurrentGauche([]);
        }

        // 3. CURSEUR
        const cursor = notationRef.current?.querySelector(".abcjs-cursor");
        if (cursor && event.left != null && event.top != null && event.height != null) {
          cursor.setAttribute("x1", (event.left - 2).toString());
          cursor.setAttribute("x2", (event.left - 2).toString());
          cursor.setAttribute("y1", event.top.toString());
          cursor.setAttribute("y2", (event.top + event.height).toString());
        }
      },
    };

    const synthControl = new abcjs.synth.SynthController();
    synthControl.load(synthControlRef.current, cursorControl, {
      displayLoop: true,
      displayRestart: true,
      displayPlay: true,
      displayProgress: true,
      displayWarp: true,
    });

    synthControl.setTune(visualObj, false).catch((err: any) => console.warn(err));

    return () => { if (synthControl) synthControl.disable(true); };
  }, [abcText]);

  return (
    <div className="min-h-screen bg-base-300 text-base-content p-6 flex flex-col items-center font-sans overflow-x-hidden">
      <div className="w-full max-w-5xl flex flex-col gap-8">

        {/* ── PARTITION ── */}
        <div className="card bg-[#fdfdfd] text-black shadow-2xl overflow-hidden border border-base-content/10 mt-6">
          <div className="card-body p-6 md:p-8 overflow-auto">
            <div ref={notationRef} className="w-full" />
          </div>
        </div>

        {/* ── PLAYER + MAINS SÉPARÉES ── */}
        <div className="flex flex-col lg:flex-row gap-6 items-stretch">

          {/* LECTEUR */}
          <div className="card bg-base-200 shadow-xl border border-base-content/5 flex-grow">
            <div className="card-body px-6 py-8 flex flex-row items-center justify-center h-full">
              <div ref={synthControlRef} className="w-full [&_.abcjs-midi-controls]:!scale-[1.1] md:[&_.abcjs-midi-controls]:!scale-[1.4] [&_.abcjs-midi-controls]:!w-[70%] [&_.abcjs-midi-controls]:!mx-auto [&_.abcjs-midi-controls]:!bg-transparent" />
            </div>
          </div>

          {/* MAIN GAUCHE (Violet) */}
          <div className="card bg-base-200 shadow-xl border-b-4 border-b-purple-500 border-base-content/5 min-w-[160px]">
            <div className="card-body flex flex-col items-center justify-center py-4">
              <span className="text-[10px] tracking-widest uppercase text-base-content/40 mb-2">Main Gauche</span>
              <div className="flex flex-wrap justify-center gap-2 min-h-[3rem]">
                {currentGauche.length > 0 ? currentGauche.map((n, i) => (
                  <span key={i} className="text-3xl font-bold text-purple-500">{n}</span>
                )) : <span className="text-3xl font-bold text-base-content/10">—</span>}
              </div>
            </div>
          </div>

          {/* MAIN DROITE (Bleu) */}
          <div className="card bg-base-200 shadow-xl border-b-4 border-b-blue-500 border-base-content/5 min-w-[160px]">
            <div className="card-body flex flex-col items-center justify-center py-4">
              <span className="text-[10px] tracking-widest uppercase text-base-content/40 mb-2">Main Droite</span>
              <div className="flex flex-wrap justify-center gap-2 min-h-[3rem]">
                {currentDroite.length > 0 ? currentDroite.map((n, i) => (
                  <span key={i} className="text-3xl font-bold text-blue-500">{n}</span>
                )) : <span className="text-3xl font-bold text-base-content/10">—</span>}
              </div>
            </div>
          </div>

        </div>

        {/* ── ÉDITEUR ── */}
        <div className="card bg-base-200 shadow-xl mt-2 mb-12">
          <div className="card-body p-6">
            <h2 className="text-xs uppercase text-base-content/40 mb-3">Code ABC</h2>
            <textarea className="textarea textarea-bordered font-mono text-sm h-48 w-full focus:border-blue-500" value={abcText} onChange={(e) => setAbcText(e.target.value)} spellCheck={false} />
          </div>
        </div>

      </div>
    </div>
  );
}