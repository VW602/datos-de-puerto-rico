import { createFileRoute } from "@tanstack/react-router";
import { PuertoRicoApp } from "@/components/explorer/PuertoRicoApp";

export const Route = createFileRoute("/")({ component: PuertoRicoApp });
