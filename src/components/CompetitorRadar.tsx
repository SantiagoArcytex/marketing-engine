import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function CompetitorRadar() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold tracking-tight">Competitor Radar</h2>
      <p className="text-sm text-muted-foreground">
        Track companies and get alerts when their ads or landing pages change.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>Competitor tracking and change alerts.</CardDescription>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground">
          <p className="text-sm">
            Competitor tracking and change alerts (e.g. via tauri-plugin-notification) will be available in a future update.
            Use Ad Explorer to search and save ads by source for manual tracking.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
