package service

import "strings"

const hermesLegacyGHCRImage = "ghcr.io/nousresearch/hermes-agent:latest"

func normalizeHermesImage(image string) string {
	img := strings.TrimSpace(image)
	if strings.EqualFold(img, hermesLegacyGHCRImage) {
		return hermesDefaultImage
	}
	return img
}

func normalizeHermesBootstrapImages(b *HermesBootstrap) {
	if b == nil {
		return
	}
	b.DefaultImage = normalizeHermesImage(b.DefaultImage)
}

func normalizeHermesInstanceImages(inst *HermesInstance) {
	if inst == nil {
		return
	}
	inst.Image = normalizeHermesImage(inst.Image)
	inst.PreviousImage = normalizeHermesImage(inst.PreviousImage)
}
