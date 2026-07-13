package engine

type EndpointV1 struct {
	ID    string  `json:"id"`
	Label string  `json:"label"`
	Lat   float64 `json:"lat"`
	Lng   float64 `json:"lng"`
}

type NodeV1 struct {
	ID       string  `json:"id"`
	Label    string  `json:"label"`
	Role     string  `json:"role"`
	Observer bool    `json:"observer"`
	Lat      float64 `json:"lat"`
	Lng      float64 `json:"lng"`
	LastSeen int64   `json:"lastSeen"`
}

type RouteV1 struct {
	ID          string     `json:"id"`
	From        EndpointV1 `json:"from"`
	To          EndpointV1 `json:"to"`
	PacketCount int64      `json:"packetCount"`
	LastHeard   int64      `json:"lastHeard"`
	Intensity   int        `json:"intensity"`
	LastKind    string     `json:"lastKind"`
	Traffic     float64    `json:"traffic"`
}

type PublicStatus struct {
	Feed         string `json:"feed"`
	Activity     string `json:"activity"`
	LastPacketAt int64  `json:"lastPacketAt,omitempty"`
	Dropped      int64  `json:"dropped"`
	Version      string `json:"version"`
	GitSHA       string `json:"gitSha"`
}

type StateV1 struct {
	SchemaVersion int          `json:"schemaVersion"`
	BootID        string       `json:"bootId"`
	Seq           uint64       `json:"seq"`
	ServerTime    int64        `json:"serverTime"`
	Status        PublicStatus `json:"status"`
	Map           MapV1        `json:"map"`
	Nodes         []NodeV1     `json:"nodes"`
	Routes        []RouteV1    `json:"routes"`
}

type MapV1 struct {
	Center [2]float64 `json:"center"`
	Zoom   float64    `json:"zoom"`
}

type RouteSegmentV1 struct {
	RouteID string     `json:"routeId"`
	From    EndpointV1 `json:"from"`
	To      EndpointV1 `json:"to"`
}

type PacketEvent struct {
	Seq         uint64           `json:"seq"`
	ID          string           `json:"id"`
	At          int64            `json:"at"`
	PayloadType string           `json:"payloadType"`
	Mode        string           `json:"mode"`
	Segments    []RouteSegmentV1 `json:"segments,omitempty"`
	Observer    *EndpointV1      `json:"observer,omitempty"`
}

type NodeEvent struct {
	Seq  uint64 `json:"seq"`
	Node NodeV1 `json:"node"`
}

type StatusEvent struct {
	Seq    uint64       `json:"seq"`
	Status PublicStatus `json:"status"`
}

type Event struct {
	Name string
	Seq  uint64
	Data any
}

type privateNode struct {
	Region        string  `json:"region"`
	Key           string  `json:"key"`
	Label         string  `json:"label"`
	Role          string  `json:"role"`
	Observer      bool    `json:"observer"`
	Lat           float64 `json:"lat"`
	Lng           float64 `json:"lng"`
	HasCoords     bool    `json:"hasCoords"`
	LastSeen      int64   `json:"lastSeen"`
	LastPublished int64   `json:"-"`
}

type privateRoute struct {
	ID          string  `json:"id"`
	FromID      string  `json:"fromId"`
	ToID        string  `json:"toId"`
	PacketCount int64   `json:"packetCount"`
	LastHeard   int64   `json:"lastHeard"`
	LastKind    string  `json:"lastKind,omitempty"`
	Traffic     float64 `json:"traffic,omitempty"`
}
