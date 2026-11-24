import React from "react";
import { Composition } from "remotion";
import { Video, FPS, totalFrames } from "./Video";
import { VideoEpico, totalFramesEpico } from "./epico/VideoEpico";

export const Root: React.FC = () => (
  <>
    <Composition id="GravitaDemo" component={Video} width={1920} height={1080} fps={FPS} durationInFrames={totalFrames} />
    <Composition id="GravitaEpico" component={VideoEpico} width={1920} height={1080} fps={FPS} durationInFrames={totalFramesEpico} />
  </>
);
