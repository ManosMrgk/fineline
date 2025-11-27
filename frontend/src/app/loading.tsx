import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import Header from "@/components/dashboard/header";

export default function Loading() {
  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="flex flex-wrap items-center gap-4">
          <Skeleton className="h-9 w-48" />
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="h-10 w-[140px]" />
            <Skeleton className="h-10 w-[120px]" />
          </div>
        </div>
        
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-10 w-1/2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-1/3" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-3/4" />
            </CardHeader>
            <CardContent className="flex justify-center items-center pt-4">
              <Skeleton className="h-[200px] w-[200px] rounded-full" />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-1/4" />
              <Skeleton className="h-4 w-1/3" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[250px] w-full" />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
