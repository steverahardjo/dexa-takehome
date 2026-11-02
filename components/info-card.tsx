
import {
  Card,
  CardContent,
  CardHeader,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  Phone,
  MapPin,
  CalendarDays,
  BriefcaseBusiness,
} from "lucide-react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"

interface EmployeeCardProps {
  name: string;
  phone: string;
  email: string;
  contractExpiry: string;
  address: string;
  role: string;
  division_name: string;
  avatarUrl?: string;
}

function getInitials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function EmployeeCard({
  name,
  phone,
  email,
  contractExpiry,
  address,
  role,
  division_name,
  avatarUrl,
}: EmployeeCardProps) {
  return (
    <Card className="max-w-md overflow-hidden pb-0">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              <AvatarImage src={avatarUrl} alt={`${name} avatar`} />
              <AvatarFallback>{getInitials(name)}</AvatarFallback>
            </Avatar>

            <div className="space-y-1">
              <CardTitle>{name}</CardTitle>
              <CardDescription>Employee Profile</CardDescription>
            </div>
          </div>
          <Badge variant="secondary">{role}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 px-6 pb-5">
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span>{email}</span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span>{phone}</span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span>{address}</span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span>Contract expires: {contractExpiry}</span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span>Division: {division_name}</span>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <BriefcaseBusiness className="h-4 w-4 text-muted-foreground" />
            <span>{role}</span>
          </div>
        </div>

        <img
          src="https://cdn.shadcnstudio.com/ss-assets/components/card/image-1.png?height=280&format=auto"
          alt="Employee banner"
          className="aspect-video w-full rounded-b-xl object-cover"
        />
      </CardContent>
    </Card>
  );
}
