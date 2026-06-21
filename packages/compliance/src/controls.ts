import type { ComplianceControl, ComplianceFramework } from "@codetruth/core";

export const COMPLIANCE_FRAMEWORKS: ComplianceFramework[] = [
  "soc2",
  "iso27001",
  "nist_csf",
  "custom",
];

const SEVERITY_RANK: Record<string, number> = {
  "Critical blocker": 5,
  "High-risk flaw": 4,
  "Medium-priority weakness": 3,
  "Low-priority debt": 2,
  "Informational observation": 1,
};

export function severityMeetsThreshold(
  severity: string,
  threshold: ComplianceControl["severityThreshold"],
): boolean {
  return (SEVERITY_RANK[severity] ?? 0) >= (SEVERITY_RANK[threshold] ?? 0);
}

export const DEFAULT_CONTROLS: ComplianceControl[] = [
  {
    id: "soc2-cc6-access",
    framework: "soc2",
    title: "Logical access controls",
    description: "Authentication and authorization mechanisms are present and enforced.",
    domains: ["security posture"],
    gapCategories: ["authentication system", "secrets management"],
    severityThreshold: "High-risk flaw",
  },
  {
    id: "soc2-cc7-monitoring",
    framework: "soc2",
    title: "System monitoring",
    description: "Operational monitoring, alerting, and error tracking are in place.",
    domains: ["observability", "DevOps maturity"],
    gapCategories: ["monitoring and alerting", "error tracking"],
    severityThreshold: "Medium-priority weakness",
  },
  {
    id: "soc2-cc8-change",
    framework: "soc2",
    title: "Change management",
    description: "CI/CD pipelines and release workflows support controlled deployments.",
    domains: ["DevOps maturity", "build readiness"],
    gapCategories: ["CI/CD pipeline", "release workflow"],
    severityThreshold: "Medium-priority weakness",
  },
  {
    id: "soc2-cc9-resilience",
    framework: "soc2",
    title: "Risk mitigation and recovery",
    description: "Backup, health checks, and recovery paths are documented and implemented.",
    domains: ["runtime readiness", "DevOps maturity"],
    gapCategories: ["backup and recovery", "health checks"],
    severityThreshold: "High-risk flaw",
  },
  {
    id: "iso-a12-operations",
    framework: "iso27001",
    title: "Operations security",
    description: "Operational procedures protect against malware, backup, and logging gaps.",
    domains: ["DevOps maturity", "observability"],
    gapCategories: ["monitoring and alerting", "backup and recovery"],
    severityThreshold: "Medium-priority weakness",
  },
  {
    id: "iso-a14-development",
    framework: "iso27001",
    title: "Secure development",
    description: "Test maturity and security posture support secure engineering practices.",
    domains: ["test maturity", "security posture"],
    gapCategories: ["test layers", "secrets management"],
    severityThreshold: "High-risk flaw",
  },
  {
    id: "nist-id-protect",
    framework: "nist_csf",
    title: "Protect — identity and access",
    description: "Identity, credential, and access management controls are enforced.",
    domains: ["security posture"],
    gapCategories: ["authentication system", "secrets management"],
    severityThreshold: "High-risk flaw",
  },
  {
    id: "nist-de-detect",
    framework: "nist_csf",
    title: "Detect — continuous monitoring",
    description: "Anomalies and security events are detectable through observability tooling.",
    domains: ["observability"],
    gapCategories: ["monitoring and alerting", "error tracking"],
    severityThreshold: "Medium-priority weakness",
  },
  {
    id: "nist-rc-recover",
    framework: "nist_csf",
    title: "Recover — resilience planning",
    description: "Recovery workflows and health verification support continuity.",
    domains: ["runtime readiness"],
    gapCategories: ["backup and recovery", "health checks"],
    severityThreshold: "High-risk flaw",
  },
];

export function controlsForFramework(framework: ComplianceFramework): ComplianceControl[] {
  return DEFAULT_CONTROLS.filter((control) => control.framework === framework);
}