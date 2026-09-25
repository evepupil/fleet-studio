import { cloudSpecs } from "./busySpecsCloud";
import { studioSpecs } from "./busySpecsStudio";
import { wikiSpecs } from "./busySpecsWiki";
import type { WorkerSpec } from "./records";

/** 繁忙场景的在跑一批：wiki-forge + CloudMind / InferForge / onaho-wiki + ui-studio / fleet-studio */
export const busyWorkerSpecs: readonly WorkerSpec[] = [...wikiSpecs, ...cloudSpecs, ...studioSpecs];
