{{- define "easypanel.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "easypanel.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name (include "easypanel.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "easypanel.frontendName" -}}
{{- printf "%s-frontend" (include "easypanel.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "easypanel.frontendFullname" -}}
{{- printf "%s-frontend" (include "easypanel.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "easypanel.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- include "easypanel.fullname" . }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "easypanel.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end }}

{{- define "easypanel.labels" -}}
helm.sh/chart: {{ include "easypanel.chart" . }}
{{ include "easypanel.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "easypanel.selectorLabels" -}}
app.kubernetes.io/name: {{ include "easypanel.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "easypanel.frontendLabels" -}}
helm.sh/chart: {{ include "easypanel.chart" . }}
{{ include "easypanel.frontendSelectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: {{ include "easypanel.name" . }}
{{- end }}

{{- define "easypanel.frontendSelectorLabels" -}}
app.kubernetes.io/name: {{ include "easypanel.frontendName" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: frontend
{{- end }}
