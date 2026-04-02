declare module "@deck.gl/react" {
  import type { DeckProps } from "@deck.gl/core";
  import * as React from "react";
  export default function DeckGL(props: DeckProps & { children?: React.ReactNode; style?: React.CSSProperties }): JSX.Element;
}

declare module "@deck.gl/layers" {
  export { ScatterplotLayer, IconLayer, LineLayer, PathLayer, PolygonLayer, GeoJsonLayer } from "deck.gl";
}
