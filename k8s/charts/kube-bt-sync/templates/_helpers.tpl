{{- define "kube-bt-sync.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "kube-bt-sync.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name (include "kube-bt-sync.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "kube-bt-sync.frontendName" -}}
{{- printf "%s-frontend" (include "kube-bt-sync.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "kube-bt-sync.frontendFullname" -}}
{{- printf "%s-frontend" (include "kube-bt-sync.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "kube-bt-sync.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- include "kube-bt-sync.fullname" . }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "kube-bt-sync.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end }}

{{- define "kube-bt-sync.labels" -}}
helm.sh/chart: {{ include "kube-bt-sync.chart" . }}
{{ include "kube-bt-sync.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "kube-bt-sync.selectorLabels" -}}
app.kubernetes.io/name: {{ include "kube-bt-sync.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "kube-bt-sync.frontendLabels" -}}
helm.sh/chart: {{ include "kube-bt-sync.chart" . }}
{{ include "kube-bt-sync.frontendSelectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: {{ include "kube-bt-sync.name" . }}
{{- end }}

{{- define "kube-bt-sync.frontendSelectorLabels" -}}
app.kubernetes.io/name: {{ include "kube-bt-sync.frontendName" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: frontend
{{- end }}
