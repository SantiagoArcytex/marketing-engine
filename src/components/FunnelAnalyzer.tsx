import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function FunnelAnalyzer() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold tracking-tight">Funnel Analyzer</h2>
      <p className="text-sm text-muted-foreground">
        Reconstruct competitor funnels: ad → landing page → offer → CTA.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>Funnel reconstruction from scraped data.</CardDescription>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground">
          <p className="text-sm">
            Funnel reconstruction from scraped data will be available in a future update.
            Scrape ads in Ad Explorer to populate data; funnel steps (landing page, offer, CTA) can be linked when those fields are added.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
