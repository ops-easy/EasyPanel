package service

import (
	"context"
	"encoding/json"
	"net/url"

	pvemodel "github.com/ops-easy/EasyPanel/backend/api/pve/model"
	pveprovider "github.com/ops-easy/EasyPanel/backend/api/pve/provider"
)

type pveAPIClient = pveprovider.Client

func normalizePVEBaseURL(raw string) (string, error) {
	return pveprovider.NormalizeBaseURL(raw)
}

func buildPVEAuthHeader(tokenID, tokenSecret string) string {
	return pveprovider.BuildAuthHeader(tokenID, tokenSecret)
}

func validatePVEGuestPowerAction(action string) error {
	return pveprovider.ValidateGuestPowerAction(action)
}

func newPVEAPIClient(target pvemodel.Target, tokenPlain string) (*pveAPIClient, error) {
	return pveprovider.NewClient(target, tokenPlain)
}

func pveGuestPowerPath(node, guestType, vmid, action string) (string, error) {
	return pveprovider.GuestPowerPath(node, guestType, vmid, action)
}

func pveDo(ctx context.Context, client *pveAPIClient, method, path string, query url.Values, body any) (json.RawMessage, error) {
	return client.Do(ctx, method, path, query, body)
}
