import { report } from './coverage.ts';
export default function setup() { report().cleanCache(); }
