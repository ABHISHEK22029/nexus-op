import React from 'react';

/* Between chapters: the next one's number and name, for about a second.
   Drawn during the engine's hand-off phase. */
export default function TitleCard({ chapter, last }) {
  return (
    <div className="fm-title-card">
      <span className="fm-title-n">{chapter.n}<small> / {last}</small></span>
      <b>{chapter.title}</b>
      <span>{chapter.kicker}</span>
    </div>
  );
}
