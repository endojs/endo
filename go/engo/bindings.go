package main

import (
	"bytes"
	"context"
	"crypto/sha512"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"net/url"
	"os"
	"path/filepath"
)

type Params struct {
	Method string `json:"method"`
}

type LocationParams struct {
	Location string `json:"location"`
}

type ResolveUrlParams struct {
	Base     string `json:"base"`
	Location string `json:"location"`
}

func RunBindingsWorker(
	ctx context.Context,
	cancel func(),
	pid, id ID,
	fetch func(context.Context) ([]Message, error),
	deliver func(context.Context, Message) error,
	getPortClosedCh func(ID, ID) (chan Message, error),
) error {

	syncBindings := map[string]func([]byte, []byte) ([]byte, error){
		"readFile": func(request []byte, _ []byte) ([]byte, error) {
			var params LocationParams
			if err := json.Unmarshal(request, &params); err != nil {
				return nil, err
			} else if response, err := ioutil.ReadFile(params.Location); err != nil {
				// TODO URL Transform
				return nil, err
			} else {
				return response, nil
			}
		},
		"realPath": func(request []byte, _ []byte) ([]byte, error) {
			var params LocationParams
			if err := json.Unmarshal(request, &params); err != nil {
				return nil, err
			}
			path := params.Location
			if realPath, err := filepath.EvalSymlinks(path); err != nil {
				return nil, err
			} else {
				return []byte(realPath), nil
			}
		},
		"getLocation": func(request []byte, _ []byte) ([]byte, error) {
			if wd, err := os.Getwd(); err != nil {
				return nil, err
			} else {
				return []byte(fmt.Sprintf("file://%s/", wd)), nil
			}
		},
		"resolveUrl": func(request []byte, _ []byte) ([]byte, error) {
			var resolveUrlParams ResolveUrlParams
			if err := json.Unmarshal(request, &resolveUrlParams); err != nil {
				return nil, err
			} else if base, err := url.Parse(resolveUrlParams.Base); err != nil {
				return nil, err
			} else if rel, err := url.Parse(resolveUrlParams.Location); err != nil {
				return nil, err
			} else {
				abs := base.ResolveReference(rel)
				return []byte(abs.String()), nil
			}
		},
		"parseUrl": func(request []byte, _ []byte) ([]byte, error) {
			var parseUrlParams LocationParams
			var parsedUrl struct {
				Protocol string `json:"protocol"`
				Origin   string `json:"origin"`
				Host     string `json:"host"`
				Hostname string `json:"hostname"`
				Port     string `json:"port"`
				Pathname string `json:"pathname"`
				Search   string `json:"search"`
				Hash     string `json:"hash"`
				Href     string `json:"href"`
			}
			if err := json.Unmarshal(request, &parseUrlParams); err != nil {
				return nil, err
			} else if u, err := url.Parse(parseUrlParams.Location); err != nil {
				return nil, err
			} else {
				parsedUrl.Protocol = fmt.Sprintf("%s:", u.Scheme)
				parsedUrl.Origin = fmt.Sprintf("%s://%s", u.Scheme, u.Host)
				parsedUrl.Host = u.Host
				parsedUrl.Hostname = u.Hostname()
				parsedUrl.Port = u.Port()
				parsedUrl.Pathname = u.EscapedPath()
				parsedUrl.Search = fmt.Sprintf("?%s", u.RawQuery)
				parsedUrl.Hash = fmt.Sprintf("#%s", u.EscapedFragment())
				parsedUrl.Href = u.String()
				if response, err := json.Marshal(parsedUrl); err != nil {
					return nil, err
				} else {
					return response, nil
				}
			}
		},
		"computeSha512": func(_ []byte, payload []byte) ([]byte, error) {
			sum := sha512.Sum512(payload)
			return sum[:], nil
		},
	}

	handleSyncCommand := func(request Message) ([]byte, error) {
		switch request.Headers.Type {
		case "system":
			var params Params
			var jsonBytes, payloadBytes []byte
			if index := bytes.Index(request.Body, []byte{'\x01'}); index >= 0 {
				jsonBytes = request.Body[:index]
				payloadBytes = request.Body[index:]
			} else {
				jsonBytes = request.Body
			}
			if err := json.Unmarshal(jsonBytes, &params); err != nil {
				return nil, err
			} else if method, ok := syncBindings[params.Method]; !ok {
				return nil, fmt.Errorf("unrecognized method: %q", params.Method)
			} else if responseBody, err := method(jsonBytes, payloadBytes); err != nil {
				return nil, err
			} else {
				return responseBody, nil
			}
		default:
			return nil, fmt.Errorf("unrecognized message type %s", request.Headers.Type)
		}
	}

	for {
		if messages, err := fetch(ctx); err != nil {
			return err
		} else {
			for _, request := range messages {
				if !request.Headers.Sync {
					switch request.Headers.Type {

					case "terminate":
						cancel()

					case "system":
						var params Params
						var jsonBytes, payloadBytes []byte
						if index := bytes.Index(request.Body, []byte{'\x01'}); index >= 0 {
							jsonBytes = request.Body[:index]
							payloadBytes = request.Body[index:]
						} else {
							jsonBytes = request.Body
						}
						if err := json.Unmarshal(jsonBytes, &params); err != nil {
							return err
						}

						// TODO
						_ = payloadBytes

						if params.Method == "readFile" {

							ctx, cancel := context.WithCancel(ctx)

							go func() {
								closedCh, err := getPortClosedCh(request.Headers.From, request.Headers.Port)
								if err != nil {
									return
								}
								<-closedCh
								cancel()
							}()

							var params LocationParams
							if err := json.Unmarshal(jsonBytes, &params); err != nil {
								response := Message{
									Headers: Headers{
										Type:  "error",
										Error: err.Error(),
										To:    request.Headers.From,
										From:  request.Headers.To,
										Port:  request.Headers.Port,
									},
								}
								if err := deliver(ctx, response); err != nil {
									return err
								}
								return nil
							}

							if request.ResponseCh != nil {
								request.ResponseCh <- Message{
									Headers: Headers{
										Type: "ack",
									},
								}
							}

							go func() {
								file, err := os.Open(params.Location)
								if err != nil {
									response := Message{
										Headers: Headers{
											Type:  "error",
											Error: err.Error(),
											To:    request.Headers.From,
											From:  request.Headers.To,
											Port:  request.Headers.Port,
										},
									}
									if err := deliver(ctx, response); err != nil {
										// TODO report somehow return
									}
								}
								defer file.Close()
								chunk := make([]byte, 1024)
								for {
									readTotal, err := file.Read(chunk)
									if err != nil {
										if err == io.EOF {
											response := Message{
												Headers: Headers{
													Type: "ok",
													To:   request.Headers.From,
													From: request.Headers.To,
													Port: request.Headers.Port,
												},
											}
											if err := deliver(ctx, response); err != nil {
												// TODO report somehow return
												return
											}
										} else {
											response := Message{
												Headers: Headers{
													Type:  "error",
													Error: err.Error(),
													To:    request.Headers.From,
													From:  request.Headers.To,
													Port:  request.Headers.Port,
												},
											}
											if err := deliver(ctx, response); err != nil {
												// TODO report somehow
												return
											}
										}
										return
									}
									body := make([]byte, readTotal)
									copy(body, chunk)
									body = append([]byte{'{', '}', '\x01'}, body...)
									response := Message{
										Headers: Headers{
											Type: "send",
											To:   request.Headers.From,
											From: request.Headers.To,
											Port: request.Headers.Port,
										},
										Body: body,
									}
									if err := deliver(ctx, response); err != nil {
										// TODO report somehow
										return
									}
								}
							}()
						}

					}
				} else {
					var response Message
					response.Headers.From = request.Headers.To
					response.Headers.To = request.Headers.From
					if responseBody, err := handleSyncCommand(request); err != nil {
						response.Headers.Type = "error"
						response.Headers.Error = err.Error()
					} else {
						response.Headers.Type = "ok"
						response.Body = responseBody
					}
					// headerBytes, _ := json.Marshal(response.Headers)
					// fmt.Printf("< %s\n  %s\n", headerBytes, string(response.Body))
					request.ResponseCh <- response
				}
			}
		}
	}
}
