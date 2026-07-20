{{- define "name" -}}
{{ .Chart.Name }}
{{- end }}

{{- define "labels" -}}
app.kubernetes.io/name: {{ include "name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
