'use client';

import { Stars } from '@react-three/drei';

export default function Starfield() {
  return (
    <Stars radius={900} depth={120} count={4000} factor={5} saturation={0} fade speed={0} />
  );
}
