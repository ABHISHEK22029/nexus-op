/* Window events a page can send the walkthrough (FlowShowcase.jsx).
   FLOW_GOTO:  play a stage from the start (detail: the stage's index).
   FLOW_VOICE: turn the voice-over on — dispatched inside a click, which is
               what lets the browser play it. */
export const FLOW_GOTO = 'mk-flow-goto';
export const FLOW_VOICE = 'mk-flow-voice';
