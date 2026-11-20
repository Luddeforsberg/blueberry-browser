import React, { useState } from "react";
import { blankForm } from "../routinesView";
import { MascotSections } from "./galleryPage/MascotSections";
import { ComposerSections } from "./galleryPage/ComposerSections";
import { ChatSections } from "./galleryPage/ChatSections";
import { BrowserSections } from "./galleryPage/BrowserSections";
import { ControlSections } from "./galleryPage/ControlSections";

// Every shared component in its states. Switch appearance in Settings to check light and dark.
export const GalleryPage: React.FC = () => {
  const [on, setOn] = useState(true);
  const [choice, setChoice] = useState<"one" | "two">("one");
  const [section, setSection] = useState<"one" | "two" | "three">("one");
  const [picture, setPicture] = useState<"light" | "dark" | "system">("system");
  const [menuOpen, setMenuOpen] = useState(false);
  const [still, setStill] = useState(false);
  const [routineForm, setRoutineForm] = useState(() => blankForm("Flight price watch"));

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-10">
        <h1 className="text-20 font-semibold">Component gallery</h1>

        <MascotSections still={still} setStill={setStill} />

        <ComposerSections />

        <ChatSections routineForm={routineForm} setRoutineForm={setRoutineForm} />

        <BrowserSections />

        <ControlSections
          on={on}
          setOn={setOn}
          choice={choice}
          setChoice={setChoice}
          section={section}
          setSection={setSection}
          picture={picture}
          setPicture={setPicture}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
        />
      </div>
    </div>
  );
};
