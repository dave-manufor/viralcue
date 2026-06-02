"use client";

import { motion } from "framer-motion";
import {
  TrendingUp,
  Zap,
  Clock,
  ThumbsUp,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const stats = [
  {
    name: "Streaming Hours",
    value: "47.5",
    unit: "/ 60 hrs",
    change: "+12.5%",
    trend: "up",
    icon: Clock,
  },
  {
    name: "Viral Moments",
    value: "23",
    subtitle: "This month",
    change: "+8",
    trend: "up",
    icon: Zap,
  },
  {
    name: "Drafts Approved",
    value: "156",
    subtitle: "89% approval rate",
    change: "+23%",
    trend: "up",
    icon: ThumbsUp,
  },
  {
    name: "Engagement Boost",
    value: "+34%",
    subtitle: "vs. last month",
    change: "+5%",
    trend: "up",
    icon: TrendingUp,
  },
];

const recentDrafts = [
  {
    id: 1,
    content:
      "🎮 That clutch play was INSANE! Sometimes you just gotta trust your instincts and go for it!",
    type: "TWEET",
    status: "APPROVED",
    time: "2 min ago",
  },
  {
    id: 2,
    content:
      "Just found the BEST wireless gaming mouse - the latency is incredible! Link in bio 🔥",
    type: "AFFILIATE",
    status: "PENDING",
    time: "5 min ago",
  },
  {
    id: 3,
    content: "Chat is wild today! Thanks for the energy everyone 💜",
    type: "TWEET",
    status: "REJECTED",
    time: "12 min ago",
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export default function DashboardPage() {
  return (
    <>
      <Header
        title="Dashboard"
        description="Overview of your streaming performance"
      />

      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          {stats.map((stat) => (
            <motion.div key={stat.name} variants={item}>
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center">
                      <stat.icon className="h-5 w-5 text-zinc-600" />
                    </div>
                    <Badge
                      variant={stat.trend === "up" ? "success" : "destructive"}
                      className="text-xs"
                    >
                      {stat.trend === "up" ? (
                        <ArrowUpRight className="h-3 w-3 mr-0.5" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3 mr-0.5" />
                      )}
                      {stat.change}
                    </Badge>
                  </div>
                  <div className="mt-4">
                    <p className="text-sm font-medium text-zinc-500">
                      {stat.name}
                    </p>
                    <p className="text-2xl font-bold text-zinc-900 mt-1">
                      {stat.value}
                      {stat.unit && (
                        <span className="text-sm font-normal text-zinc-400 ml-1">
                          {stat.unit}
                        </span>
                      )}
                    </p>
                    {stat.subtitle && (
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {stat.subtitle}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        {/* Recent Drafts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <CardTitle className="text-lg">Recent Drafts</CardTitle>
              <Badge variant="secondary">Last 24 hours</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-zinc-100">
                {recentDrafts.map((draft) => (
                  <motion.div
                    key={draft.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-start gap-4 p-4 hover:bg-zinc-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-900 line-clamp-2">
                        {draft.content}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge
                          variant={
                            draft.type === "AFFILIATE" ? "warning" : "secondary"
                          }
                        >
                          {draft.type}
                        </Badge>
                        <span className="text-xs text-zinc-400">
                          {draft.time}
                        </span>
                      </div>
                    </div>
                    <Badge
                      variant={
                        draft.status === "APPROVED"
                          ? "success"
                          : draft.status === "REJECTED"
                            ? "destructive"
                            : "outline"
                      }
                    >
                      {draft.status}
                    </Badge>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </>
  );
}
