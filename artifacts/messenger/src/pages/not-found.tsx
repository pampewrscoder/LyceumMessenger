import { Card, CardContent } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background">
      <Card className="mx-4 w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8">
          <div className="font-serif text-6xl text-muted-foreground/40">404</div>
          <h1 className="font-serif text-2xl text-foreground">Страница не найдена</h1>
          <p className="text-center text-sm text-muted-foreground">Этой страницы не существует или она была перемещена.</p>
        </CardContent>
      </Card>
    </div>
  );
}