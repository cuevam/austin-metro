import dynamic from "next/dynamic";

const FleetMap = dynamic(() => import("./FleetMap"), { ssr: false });

export default function Page() {
  return <FleetMap />;
}
