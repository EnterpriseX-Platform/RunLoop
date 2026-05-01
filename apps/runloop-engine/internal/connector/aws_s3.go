package connector

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// S3Connector implements AWS S3 operations
type S3Connector struct {
	client     *s3.Client
	presigner  *s3.PresignClient
	bucket     string
	region     string
}

// NewS3Connector creates a new S3 connector
func NewS3Connector() *S3Connector {
	return &S3Connector{}
}

// Metadata returns connector metadata
func (s *S3Connector) Metadata() ConnectorMetadata {
	return ConnectorMetadata{
		Type:        TypeS3,
		Name:        "AWS S3",
		Description: "Store and retrieve files from Amazon S3",
		Category:    CategoryStorage,
		Icon:        "cloud",
		Version:     "1.0.0",
		ConfigSchema: ConfigSchema{
			Fields: []ConfigField{
				{
					Name:        "region",
					Type:        "string",
					Label:       "AWS Region",
					Description: "AWS region (e.g., us-east-1)",
					Required:    true,
				},
				{
					Name:        "bucket",
					Type:        "string",
					Label:       "Default Bucket",
					Description: "Default S3 bucket name",
					Required:    false,
				},
				{
					Name:        "access_key_id",
					Type:        "string",
					Label:       "Access Key ID",
					Description: "AWS Access Key ID",
					Required:    true,
					Secret:      true,
				},
				{
					Name:        "secret_access_key",
					Type:        "string",
					Label:       "Secret Access Key",
					Description: "AWS Secret Access Key",
					Required:    true,
					Secret:      true,
				},
				{
					Name:        "endpoint",
					Type:        "string",
					Label:       "Custom Endpoint",
					Description: "Custom S3 endpoint (for MinIO, etc.)",
					Required:    false,
				},
			},
		},
		SupportsActions: true,
	}
}

// ValidateConfig validates the configuration
func (s *S3Connector) ValidateConfig(cfg map[string]interface{}) error {
	required := []string{"region", "access_key_id", "secret_access_key"}
	for _, field := range required {
		if val, ok := cfg[field].(string); !ok || val == "" {
			return fmt.Errorf("%s is required", field)
		}
	}
	return nil
}

// Initialize initializes the connector
func (s *S3Connector) Initialize(ctx context.Context, cfg map[string]interface{}) error {
	if err := s.ValidateConfig(cfg); err != nil {
		return err
	}

	region := cfg["region"].(string)
	accessKeyID := cfg["access_key_id"].(string)
	secretAccessKey := cfg["secret_access_key"].(string)
	
	if bucket, ok := cfg["bucket"].(string); ok {
		s.bucket = bucket
	}
	s.region = region

	// Load AWS config
	awsCfg, err := config.LoadDefaultConfig(ctx,
		config.WithRegion(region),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			accessKeyID,
			secretAccessKey,
			"",
		)),
	)
	if err != nil {
		return fmt.Errorf("failed to load AWS config: %w", err)
	}

	// Create S3 client options
	optFns := []func(*s3.Options){}
	
	if endpoint, ok := cfg["endpoint"].(string); ok && endpoint != "" {
		optFns = append(optFns, func(o *s3.Options) {
			o.BaseEndpoint = aws.String(endpoint)
			o.UsePathStyle = true
		})
	}

	s.client = s3.NewFromConfig(awsCfg, optFns...)
	s.presigner = s3.NewPresignClient(s.client)

	return nil
}

// HealthCheck checks if the connector is healthy
func (s *S3Connector) HealthCheck(ctx context.Context) error {
	if s.client == nil {
		return fmt.Errorf("not initialized")
	}
	
	// Try to list buckets
	_, err := s.client.ListBuckets(ctx, &s3.ListBucketsInput{})
	return err
}

// Close closes the connector
func (s *S3Connector) Close() error {
	return nil
}

// GetActions returns available actions
func (s *S3Connector) GetActions() []ActionDefinition {
	return []ActionDefinition{
		{
			Name:        "upload",
			Label:       "Upload File",
			Description: "Upload a file to S3",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "bucket",
						Type:        "string",
						Label:       "Bucket",
						Description: "S3 bucket name (uses default if not specified)",
						Required:    false,
					},
					{
						Name:        "key",
						Type:        "string",
						Label:       "Object Key",
						Description: "Path in bucket (e.g., folder/file.txt)",
						Required:    true,
					},
					{
						Name:        "content",
						Type:        "string",
						Label:       "Content",
						Description: "File content (text or base64)",
						Required:    true,
					},
					{
						Name:        "content_type",
						Type:        "string",
						Label:       "Content Type",
						Description: "MIME type (e.g., application/json)",
						Required:    false,
					},
					{
						Name:        "is_base64",
						Type:        "boolean",
						Label:       "Content is Base64",
						Description: "Decode content from base64 before upload",
						Required:    false,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "etag",
						Type:        "string",
						Label:       "ETag",
						Required:    true,
					},
					{
						Name:        "url",
						Type:        "string",
						Label:       "Object URL",
						Required:    true,
					},
					{
						Name:        "key",
						Type:        "string",
						Label:       "Object Key",
						Required:    true,
					},
				},
			},
		},
		{
			Name:        "download",
			Label:       "Download File",
			Description: "Download a file from S3",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "bucket",
						Type:        "string",
						Label:       "Bucket",
						Description: "S3 bucket name",
						Required:    false,
					},
					{
						Name:        "key",
						Type:        "string",
						Label:       "Object Key",
						Description: "Path to file in bucket",
						Required:    true,
					},
					{
						Name:        "as_base64",
						Type:        "boolean",
						Label:       "Return as Base64",
						Description: "Encode content as base64",
						Required:    false,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "content",
						Type:        "string",
						Label:       "File Content",
						Required:    true,
					},
					{
						Name:        "content_type",
						Type:        "string",
						Label:       "Content Type",
						Required:    true,
					},
					{
						Name:        "size",
						Type:        "number",
						Label:       "File Size (bytes)",
						Required:    true,
					},
					{
						Name:        "last_modified",
						Type:        "string",
						Label:       "Last Modified",
						Required:    true,
					},
				},
			},
		},
		{
			Name:        "delete",
			Label:       "Delete File",
			Description: "Delete a file from S3",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "bucket",
						Type:        "string",
						Label:       "Bucket",
						Required:    false,
					},
					{
						Name:        "key",
						Type:        "string",
						Label:       "Object Key",
						Required:    true,
					},
				},
			},
		},
		{
			Name:        "list",
			Label:       "List Objects",
			Description: "List files in a bucket/prefix",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "bucket",
						Type:        "string",
						Label:       "Bucket",
						Required:    false,
					},
					{
						Name:        "prefix",
						Type:        "string",
						Label:       "Prefix",
						Description: "Filter by path prefix",
						Required:    false,
					},
					{
						Name:        "max_keys",
						Type:        "number",
						Label:       "Max Keys",
						Description: "Maximum number of objects to return",
						Required:    false,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "objects",
						Type:        "string",
						Label:       "Objects (JSON array)",
						Required:    true,
					},
					{
						Name:        "count",
						Type:        "number",
						Label:       "Count",
						Required:    true,
					},
				},
			},
		},
		{
			Name:        "generate_presigned_url",
			Label:       "Generate Presigned URL",
			Description: "Create a temporary download URL",
			Params: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "bucket",
						Type:        "string",
						Label:       "Bucket",
						Required:    false,
					},
					{
						Name:        "key",
						Type:        "string",
						Label:       "Object Key",
						Required:    true,
					},
					{
						Name:        "expires_in",
						Type:        "number",
						Label:       "Expires In (seconds)",
						Description: "URL expiration time (default: 3600)",
						Required:    false,
					},
				},
			},
			Output: ConfigSchema{
				Fields: []ConfigField{
					{
						Name:        "url",
						Type:        "string",
						Label:       "Presigned URL",
						Required:    true,
					},
					{
						Name:        "expires_at",
						Type:        "string",
						Label:       "Expires At",
						Required:    true,
					},
				},
			},
		},
	}
}

// ExecuteAction executes an action
func (s *S3Connector) ExecuteAction(ctx context.Context, action string, params map[string]interface{}) (*ActionResult, error) {
	switch action {
	case "upload":
		return s.upload(ctx, params)
	case "download":
		return s.download(ctx, params)
	case "delete":
		return s.delete(ctx, params)
	case "list":
		return s.list(ctx, params)
	case "generate_presigned_url":
		return s.generatePresignedURL(ctx, params)
	default:
		return nil, fmt.Errorf("unknown action: %s", action)
	}
}

func (s *S3Connector) upload(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	bucket := s.getBucket(params)
	key := params["key"].(string)
	content := params["content"].(string)
	
	var body []byte
	if isBase64, ok := params["is_base64"].(bool); ok && isBase64 {
		// Decode base64
		decoded, err := base64.StdEncoding.DecodeString(content)
		if err != nil {
			return nil, fmt.Errorf("failed to decode base64: %w", err)
		}
		body = decoded
	} else {
		body = []byte(content)
	}
	
	input := &s3.PutObjectInput{
		Bucket:      aws.String(bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(body),
		ContentLength: aws.Int64(int64(len(body))),
	}
	
	if contentType, ok := params["content_type"].(string); ok && contentType != "" {
		input.ContentType = aws.String(contentType)
	}
	
	result, err := s.client.PutObject(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("failed to upload: %w", err)
	}
	
	url := fmt.Sprintf("https://%s.s3.%s.amazonaws.com/%s", bucket, s.region, key)
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"etag": aws.ToString(result.ETag),
			"url":  url,
			"key":  key,
		},
	}, nil
}

func (s *S3Connector) download(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	bucket := s.getBucket(params)
	key := params["key"].(string)
	
	result, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to download: %w", err)
	}
	defer result.Body.Close()
	
	body, err := io.ReadAll(result.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read body: %w", err)
	}
	
	// Convert to string or base64
	var content string
	if asBase64, ok := params["as_base64"].(bool); ok && asBase64 {
		content = base64.StdEncoding.EncodeToString(body)
	} else {
		content = string(body)
	}
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"content":      content,
			"content_type": aws.ToString(result.ContentType),
			"size":         result.ContentLength,
			"last_modified": result.LastModified.Format(time.RFC3339),
		},
	}, nil
}

func (s *S3Connector) delete(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	bucket := s.getBucket(params)
	key := params["key"].(string)
	
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to delete: %w", err)
	}
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"deleted": true,
			"key":     key,
		},
	}, nil
}

func (s *S3Connector) list(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	bucket := s.getBucket(params)
	
	input := &s3.ListObjectsV2Input{
		Bucket: aws.String(bucket),
	}
	
	if prefix, ok := params["prefix"].(string); ok && prefix != "" {
		input.Prefix = aws.String(prefix)
	}
	
	if maxKeys, ok := params["max_keys"].(float64); ok {
		input.MaxKeys = aws.Int32(int32(maxKeys))
	}
	
	result, err := s.client.ListObjectsV2(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("failed to list objects: %w", err)
	}
	
	var objects []map[string]interface{}
	for _, obj := range result.Contents {
		objects = append(objects, map[string]interface{}{
			"key":          aws.ToString(obj.Key),
			"size":         obj.Size,
			"last_modified": obj.LastModified.Format(time.RFC3339),
			"etag":         aws.ToString(obj.ETag),
		})
	}
	
	objectsJSON, _ := json.Marshal(objects)
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"objects": string(objectsJSON),
			"count":   len(objects),
		},
	}, nil
}

func (s *S3Connector) generatePresignedURL(ctx context.Context, params map[string]interface{}) (*ActionResult, error) {
	bucket := s.getBucket(params)
	key := params["key"].(string)
	
	expiresIn := int64(3600)
	if exp, ok := params["expires_in"].(float64); ok {
		expiresIn = int64(exp)
	}
	
	req, err := s.presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	}, s3.WithPresignExpires(time.Duration(expiresIn)*time.Second))
	
	if err != nil {
		return nil, fmt.Errorf("failed to generate presigned URL: %w", err)
	}
	
	expiresAt := time.Now().Add(time.Duration(expiresIn) * time.Second)
	
	return &ActionResult{
		Success: true,
		Data: map[string]interface{}{
			"url":        req.URL,
			"expires_at": expiresAt.Format(time.RFC3339),
		},
	}, nil
}

func (s *S3Connector) getBucket(params map[string]interface{}) string {
	if bucket, ok := params["bucket"].(string); ok && bucket != "" {
		return bucket
	}
	return s.bucket
}
