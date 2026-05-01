package connector

import "log"

// Initialize registers all built-in connectors
func Initialize() {
	connectors := []Connector{
		NewSlackConnector(),
		NewHTTPConnector(),
		NewEmailConnector(),
		NewDatabaseConnector(),
		NewS3Connector(),
		NewGitHubConnector(),
		NewRedisConnector(),
		NewMongoDBConnector(),
	}

	for _, c := range connectors {
		meta := c.Metadata()
		if err := Register(c); err != nil {
			log.Printf("Failed to register connector %s: %v", meta.Type, err)
		} else {
			log.Printf("Registered connector: %s (%s)", meta.Name, meta.Type)
		}
	}
}

// GetAllConnectors returns a list of all available connector metadata
func GetAllConnectors() []ConnectorMetadata {
	return List()
}

// GetConnectorCategories returns all connector categories with their connectors
func GetConnectorCategories() map[string][]ConnectorMetadata {
	return map[string][]ConnectorMetadata{
		CategoryNotification:  globalRegistry.ListByCategory(CategoryNotification),
		CategoryCommunication: globalRegistry.ListByCategory(CategoryCommunication),
		CategoryCloud:         globalRegistry.ListByCategory(CategoryCloud),
		CategoryDatabase:      globalRegistry.ListByCategory(CategoryDatabase),
		CategoryStorage:       globalRegistry.ListByCategory(CategoryStorage),
		CategoryDevOps:        globalRegistry.ListByCategory(CategoryDevOps),
		CategoryMonitoring:    globalRegistry.ListByCategory(CategoryMonitoring),
	}
}
